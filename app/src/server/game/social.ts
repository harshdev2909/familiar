import "server-only";
import { createHash } from "node:crypto";
import { and, count, desc, eq, gt, ne, sql } from "drizzle-orm";
import type { Session } from "../auth/session";
import { fullName } from "../chain/ens";
import { db, schema } from "../db/client";
import { AppError } from "../errors";
import { getFamiliarRow, myFamiliarRow } from "../familiar/service";
import { SPECIES, stageFor, utcDate } from "../familiar/rules";
import { log } from "../log";
import { levelFor } from "./progress";
import { grant } from "./service";

/** Explore / Dex / gifts: spotting other Familiars, Pokémon GO-style. */
export const SOCIAL = {
  spot: { sparks: 5, xp: 5, newSpeciesBonus: 10 },
  gift: { senderXp: 3, recipientSparks: 5 },
  exploreLimit: 40,
} as const;

const NOBODY = "00000000-0000-0000-0000-000000000000";
const f = schema.familiars;

export interface ExploreFamiliar {
  label: string;
  name: string;
  species: string;
  color: string;
  stage: string;
  level: number;
  mood: string | null;
  portraitUrl: string | null;
  spotted: boolean;
  mine: boolean;
  giftedToday: boolean;
  pin: { x: number; y: number };
}

/** Deterministic map position in 0.08–0.92 from the label. */
export function pinFor(label: string) {
  const h = createHash("sha256").update(`pin:${label}`).digest();
  const at = (o: number) => Math.round((0.08 + (h.readUInt32BE(o) / 0xffffffff) * 0.84) * 10_000) / 10_000;
  return { x: at(0), y: at(4) };
}

async function viewerFamiliar(session: Session | null) {
  if (!session) return undefined;
  const d = await db();
  return d.query.familiars.findFirst({ where: eq(f.owner, session.address.toLowerCase()), columns: { id: true, label: true } });
}

/** Up to 40 awake Familiars, most recently visited first. One query (sightings/gifts left-joined). */
export async function explore(session: Session | null): Promise<{ familiars: ExploreFamiliar[] }> {
  const d = await db();
  const me = await viewerFamiliar(session);
  const meId = me?.id ?? NOBODY;
  const today = utcDate();
  const rows = await d
    .select({
      id: f.id,
      label: f.label,
      species: f.species,
      color: f.color,
      day: f.day,
      xp: f.xp,
      mood: f.mood,
      portraitUrl: f.portraitUrl,
      spotted: sql<boolean>`${schema.sightings.id} is not null`,
      giftedToday: sql<boolean>`${schema.gifts.id} is not null`,
    })
    .from(f)
    .leftJoin(schema.sightings, and(eq(schema.sightings.spottedFamiliarId, f.id), eq(schema.sightings.spotterFamiliarId, meId)))
    .leftJoin(schema.gifts, and(eq(schema.gifts.toFamiliarId, f.id), eq(schema.gifts.fromFamiliarId, meId), eq(schema.gifts.utcDate, today)))
    .where(gt(f.expiresAt, new Date()))
    .orderBy(sql`${f.lastVisitAt} desc nulls last`, desc(f.updatedAt))
    .limit(SOCIAL.exploreLimit);
  return {
    familiars: rows.map((r) => ({
      label: r.label,
      name: fullName(r.label),
      species: r.species,
      color: r.color,
      stage: stageFor(r.day),
      level: levelFor(r.xp).level,
      mood: r.mood,
      portraitUrl: r.portraitUrl,
      spotted: Boolean(r.spotted),
      mine: r.id === me?.id,
      giftedToday: Boolean(r.giftedToday),
      pin: pinFor(r.label),
    })),
  };
}

async function target(raw: string, me: { id: string }) {
  const t = await getFamiliarRow(raw.trim().toLowerCase());
  if (!t) throw new AppError("NOT_FOUND", "No Familiar with that name");
  if (t.id === me.id) throw new AppError("BAD_REQUEST", "That's your own Familiar");
  return t;
}

/** Spot another Familiar (once per pair): +5 Sparks +5 XP, +10 Sparks more for a new species. */
export async function spot(session: Session, label: string) {
  const me = await myFamiliarRow(session);
  const t = await target(label, me);
  const d = await db();
  return d.transaction(async (tx) => {
    // Serialize this spotter's sightings so "new species" is decided once.
    await tx.select({ id: f.id }).from(f).where(eq(f.id, me.id)).for("update");
    const ins = await tx
      .insert(schema.sightings)
      .values({ spotterFamiliarId: me.id, spottedFamiliarId: t.id })
      .onConflictDoNothing()
      .returning({ id: schema.sightings.id });
    if (!ins.length) throw new AppError("ALREADY_SPOTTED", `You've already spotted ${t.label}`);
    const [prior] = await tx
      .select({ n: count() })
      .from(schema.sightings)
      .innerJoin(f, eq(f.id, schema.sightings.spottedFamiliarId))
      .where(and(eq(schema.sightings.spotterFamiliarId, me.id), eq(f.species, t.species), ne(schema.sightings.spottedFamiliarId, t.id)));
    const newSpecies = Number(prior?.n ?? 0) === 0;
    const reward = { sparks: SOCIAL.spot.sparks + (newSpecies ? SOCIAL.spot.newSpeciesBonus : 0), xp: SOCIAL.spot.xp };
    await grant(tx, me.id, { ...reward, reason: "spot", ref: `spot:${me.id}:${t.id}` });
    log.info("spot", { spotter: me.label, spotted: t.label, newSpecies });
    return { spotted: t.label, reward, newSpecies };
  });
}

/** Send a gift to a Familiar you've spotted, once per UTC day: you get +3 XP, they get +5 Sparks. */
export async function gift(session: Session, label: string) {
  const me = await myFamiliarRow(session);
  const t = await target(label, me);
  const today = utcDate();
  const d = await db();
  return d.transaction(async (tx) => {
    const [seen] = await tx
      .select({ id: schema.sightings.id })
      .from(schema.sightings)
      .where(and(eq(schema.sightings.spotterFamiliarId, me.id), eq(schema.sightings.spottedFamiliarId, t.id)));
    if (!seen) throw new AppError("FORBIDDEN", `Spot ${t.label} first`);
    const ins = await tx
      .insert(schema.gifts)
      .values({ fromFamiliarId: me.id, toFamiliarId: t.id, utcDate: today })
      .onConflictDoNothing()
      .returning({ id: schema.gifts.id });
    if (!ins.length) throw new AppError("ALREADY_GIFTED", `You've already sent ${t.label} a gift today — again after 00:00 UTC`);
    await grant(tx, me.id, { sparks: 0, xp: SOCIAL.gift.senderXp, reason: "gift:sent", ref: `gift-sent:${me.id}:${t.id}:${today}` });
    await grant(tx, t.id, { sparks: SOCIAL.gift.recipientSparks, reason: "gift:received", ref: `gift:${me.id}:${t.id}:${today}` });
    log.info("gift", { from: me.label, to: t.label });
    return { gifted: t.label, reward: { sparks: 0, xp: SOCIAL.gift.senderXp } };
  });
}

const speciesName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** The Dex: every species (caught = spotted at least one) and every Familiar you've spotted. One query. */
export async function dex(session: Session) {
  const d = await db();
  const me = await viewerFamiliar(session);
  const today = utcDate();
  const rows = me
    ? await d
        .select({
          label: f.label,
          species: f.species,
          portraitUrl: f.portraitUrl,
          expiresAt: f.expiresAt,
          spottedAt: schema.sightings.createdAt,
          giftedToday: sql<boolean>`${schema.gifts.id} is not null`,
        })
        .from(schema.sightings)
        .innerJoin(f, eq(f.id, schema.sightings.spottedFamiliarId))
        .leftJoin(schema.gifts, and(eq(schema.gifts.toFamiliarId, f.id), eq(schema.gifts.fromFamiliarId, me.id), eq(schema.gifts.utcDate, today)))
        .where(eq(schema.sightings.spotterFamiliarId, me.id))
        .orderBy(desc(schema.sightings.createdAt))
    : [];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.species, (counts.get(r.species) ?? 0) + 1);
  const now = Date.now();
  const species = SPECIES.map((id) => ({ id, name: speciesName(id), art: `/art/${id}.jpg`, caught: (counts.get(id) ?? 0) > 0, count: counts.get(id) ?? 0 }));
  return {
    species,
    spotted: rows.map((r) => ({
      label: r.label,
      name: fullName(r.label),
      species: r.species,
      portraitUrl: r.expiresAt.getTime() > now ? r.portraitUrl : null,
      spottedAt: r.spottedAt.toISOString(),
      giftedToday: Boolean(r.giftedToday),
    })),
    caught: species.filter((s) => s.caught).length,
    total: species.length,
  };
}
