import "server-only";
import { after } from "next/server";
import { and, asc, count, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { Session } from "../auth/session";
import { db, schema } from "../db/client";
import { env } from "../env";
import { AppError } from "../errors";
import { stageFor, utcDate } from "../familiar/rules";
import { log } from "../log";
import { assertMediaConfigured, imageType, loadMedia, storeMedia } from "../media";
import { ZeroGRouter, toDataUrl } from "../zerog/router";
import { type Tx, grant, wearing } from "./service";

/**
 * Night walks: a host invites up to two friends; when the third joins (or the host starts with two)
 * Seedream paints them walking together, team-paid, with every member's latest portrait as a
 * reference. Painting runs after the response; each member earns Sparks + XP once it's done.
 */
export const WALK = {
  maxMembers: 3,
  minMembers: 2,
  reward: { sparks: 20, xp: 20 },
  /** The reconcile cron fails walks still painting after this long. */
  stuckMs: 10 * 60_000,
  listLimit: 12,
} as const;

type WalkRow = typeof schema.walks.$inferSelect;
const w = schema.walks;
const m = schema.walkMembers;
const f = schema.familiars;

export interface WalkMemberView {
  label: string;
  species: string;
  color: string;
  portraitUrl: string | null;
}

export interface WalkView {
  id: string;
  status: WalkRow["status"];
  /** Host's label. */
  host: string;
  members: WalkMemberView[];
  imageUrl: string | null;
  createdAt: string;
  inviteUrl: string;
  canJoin: boolean;
  canStart: boolean;
  joined: boolean;
}

interface MemberRow {
  walkId: string;
  familiarId: string;
  label: string;
  species: string;
  color: string;
  day: number;
  equipped: Record<string, string>;
  portraitUrl: string | null;
  expiresAt: Date;
}

interface Viewer {
  id: string;
  /** Already joined someone else's walk today (one join per Familiar per UTC day). */
  joinedToday: boolean;
}

/** Every member of the given walks, in joining order. One query. */
async function membersOf(conn: Tx | Awaited<ReturnType<typeof db>>, walkIds: string[]): Promise<Map<string, MemberRow[]>> {
  const out = new Map<string, MemberRow[]>();
  if (!walkIds.length) return out;
  const rows = await conn
    .select({
      walkId: m.walkId,
      familiarId: m.familiarId,
      label: f.label,
      species: f.species,
      color: f.color,
      day: f.day,
      equipped: f.equipped,
      portraitUrl: f.portraitUrl,
      expiresAt: f.expiresAt,
    })
    .from(m)
    .innerJoin(f, eq(f.id, m.familiarId))
    .where(inArray(m.walkId, walkIds))
    .orderBy(asc(m.joinedAt));
  for (const r of rows) out.set(r.walkId, [...(out.get(r.walkId) ?? []), r]);
  return out;
}

/** Non-host walks this Familiar joined today (failed walks don't count). */
async function joinedToday(conn: Tx | Awaited<ReturnType<typeof db>>, familiarId: string, today = utcDate()) {
  const [row] = await conn
    .select({ n: count() })
    .from(m)
    .innerJoin(w, eq(w.id, m.walkId))
    .where(and(eq(m.familiarId, familiarId), eq(w.utcDate, today), ne(w.hostFamiliarId, familiarId), ne(w.status, "failed")));
  return Number(row?.n ?? 0);
}

async function viewerOf(session: Session | null): Promise<Viewer | undefined> {
  if (!session) return undefined;
  const d = await db();
  const me = await d.query.familiars.findFirst({ where: eq(f.owner, session.address.toLowerCase()), columns: { id: true } });
  if (!me) return undefined;
  return { id: me.id, joinedToday: (await joinedToday(d, me.id)) > 0 };
}

export function walkView(walk: WalkRow, members: MemberRow[], viewer: Viewer | undefined, now = new Date()): WalkView {
  const joined = Boolean(viewer && members.some((x) => x.familiarId === viewer.id));
  const open = walk.status === "gathering" && walk.utcDate === utcDate(now);
  return {
    id: walk.id,
    status: walk.status,
    host: members.find((x) => x.familiarId === walk.hostFamiliarId)?.label ?? "",
    members: members.map((x) => ({ label: x.label, species: x.species, color: x.color, portraitUrl: x.expiresAt.getTime() > now.getTime() ? x.portraitUrl : null })),
    imageUrl: walk.imageUrl,
    createdAt: walk.createdAt.toISOString(),
    inviteUrl: `${env().APP_URL}/walk/${walk.id}`,
    canJoin: Boolean(viewer) && !joined && open && members.length < WALK.maxMembers && !viewer!.joinedToday,
    canStart: Boolean(viewer) && viewer!.id === walk.hostFamiliarId && open && members.length >= WALK.minMembers,
    joined,
  };
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadWalk(id: string): Promise<WalkRow> {
  if (!uuidRe.test(id)) throw new AppError("NOT_FOUND", "No such walk");
  const d = await db();
  const row = await d.query.walks.findFirst({ where: eq(w.id, id) });
  if (!row) throw new AppError("NOT_FOUND", "No such walk");
  return row;
}

/** Public walk state, with viewer-aware flags (all false when signed out). */
export async function getWalk(id: string, session: Session | null): Promise<{ walk: WalkView }> {
  const walk = await loadWalk(id);
  const d = await db();
  const [members, viewer] = await Promise.all([membersOf(d, [walk.id]), viewerOf(session)]);
  return { walk: walkView(walk, members.get(walk.id) ?? [], viewer) };
}

/** The signed-in human's awake Familiar (walks need a portrait to paint). */
async function walker(session: Session) {
  const d = await db();
  const me = await d.query.familiars.findFirst({ where: eq(f.owner, session.address.toLowerCase()) });
  if (!me) throw new AppError("NOT_FOUND", "Hatch a Familiar first");
  if (me.expiresAt.getTime() <= Date.now()) throw new AppError("DORMANT", `${me.label} is asleep — wake it up first`, { label: me.label });
  return me;
}

/** Host a walk: one per Familiar per UTC day (a failed painting frees the day), global daily cap. */
export async function createWalk(session: Session): Promise<{ walk: WalkView }> {
  // Fail before anyone gathers if the painting could never be paid for or stored.
  if (!env().ZG_API_KEY) throw new AppError("NOT_CONFIGURED", "Night walks are not available right now");
  assertMediaConfigured();
  const me = await walker(session);
  const today = utcDate();
  const d = await db();
  const id = await d.transaction(async (tx) => {
    // One lock for every create: the per-host rule and the global cap are decided together.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('walks:create'))`);
    const [hosted, total] = await Promise.all([
      tx
        .select({ n: count() })
        .from(w)
        .where(and(eq(w.hostFamiliarId, me.id), eq(w.utcDate, today), ne(w.status, "failed"))),
      tx.select({ n: count() }).from(w).where(eq(w.utcDate, today)),
    ]);
    if (Number(hosted[0]?.n ?? 0) > 0) throw new AppError("ALREADY_WALKED", `${me.label} already went on a walk tonight — again after 00:00 UTC`);
    if (Number(total[0]?.n ?? 0) >= env().WALKS_PER_DAY) throw new AppError("RATE_LIMITED", "Tonight's night walks are all taken — try again after 00:00 UTC");
    const [row] = await tx.insert(w).values({ hostFamiliarId: me.id, utcDate: today }).returning({ id: w.id });
    await tx.insert(m).values({ walkId: row!.id, familiarId: me.id });
    return row!.id;
  });
  log.info("walk_created", { walkId: id, host: me.label });
  return getWalk(id, session);
}

/** Join a gathering walk (max 3 including the host). The third member sets it off painting. */
export async function joinWalk(session: Session, id: string): Promise<{ walk: WalkView; painting: boolean }> {
  const me = await walker(session);
  const today = utcDate();
  await loadWalk(id);
  const d = await db();
  const painting = await d.transaction(async (tx) => {
    const [walk] = await tx.select().from(w).where(eq(w.id, id)).for("update");
    if (!walk) throw new AppError("NOT_FOUND", "No such walk");
    const members = await tx.select({ familiarId: m.familiarId }).from(m).where(eq(m.walkId, id));
    if (members.some((x) => x.familiarId === me.id)) throw new AppError("CONFLICT", `${me.label} is already on this walk`);
    if (members.length >= WALK.maxMembers) throw new AppError("WALK_FULL", "This walk is full — three is a crowd already");
    if (walk.status !== "gathering" || walk.utcDate !== today) throw new AppError("CONFLICT", "This walk has already set off");
    // Serialize this Familiar's joins across walks so "one join per day" holds under concurrency.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`walk-join:${me.id}`}))`);
    if ((await joinedToday(tx, me.id, today)) > 0) throw new AppError("ALREADY_WALKED", `${me.label} already joined a walk tonight — again after 00:00 UTC`);
    await tx.insert(m).values({ walkId: id, familiarId: me.id });
    if (members.length + 1 < WALK.maxMembers) return false;
    const started = await tx
      .update(w)
      .set({ status: "painting", startedAt: new Date() })
      .where(and(eq(w.id, id), eq(w.status, "gathering")))
      .returning({ id: w.id });
    return started.length > 0;
  });
  log.info("walk_joined", { walkId: id, label: me.label, painting });
  return { ...(await getWalk(id, session)), painting };
}

/** The host sets off early with two members. */
export async function startWalk(session: Session, id: string): Promise<{ walk: WalkView; painting: boolean }> {
  const me = await walker(session);
  await loadWalk(id);
  const d = await db();
  await d.transaction(async (tx) => {
    const [walk] = await tx.select().from(w).where(eq(w.id, id)).for("update");
    if (!walk) throw new AppError("NOT_FOUND", "No such walk");
    if (walk.hostFamiliarId !== me.id) throw new AppError("FORBIDDEN", "Only the host can start the walk");
    if (walk.status !== "gathering" || walk.utcDate !== utcDate()) throw new AppError("CONFLICT", "This walk has already set off");
    const [{ n }] = (await tx.select({ n: count() }).from(m).where(eq(m.walkId, id))) as [{ n: number }];
    if (Number(n) < WALK.minMembers) throw new AppError("BAD_REQUEST", "Wait for at least one friend to join");
    await tx.update(w).set({ status: "painting", startedAt: new Date() }).where(eq(w.id, id));
  });
  log.info("walk_started", { walkId: id, host: me.label });
  return { ...(await getWalk(id, session)), painting: true };
}

/** The latest finished walks a Familiar was in (public). */
export async function familiarWalks(label: string, session: Session | null): Promise<{ walks: WalkView[] }> {
  const d = await db();
  const fam = await d.query.familiars.findFirst({ where: eq(f.label, label.trim().toLowerCase()), columns: { id: true } });
  if (!fam) throw new AppError("NOT_FOUND", "No Familiar with that name");
  const rows = await d
    .select({ walk: w })
    .from(w)
    .innerJoin(m, eq(m.walkId, w.id))
    .where(and(eq(m.familiarId, fam.id), eq(w.status, "done")))
    .orderBy(desc(w.createdAt))
    .limit(WALK.listLimit);
  const [members, viewer] = await Promise.all([membersOf(d, rows.map((r) => r.walk.id)), viewerOf(session)]);
  return { walks: rows.map((r) => walkView(r.walk, members.get(r.walk.id) ?? [], viewer)) };
}

/** Seedream prompt for a walk: every member described the way its own portrait is. */
export function walkPrompt(members: Pick<MemberRow, "color" | "species" | "day" | "equipped">[]) {
  const who = members.map((x) => {
    const worn = wearing(x.equipped);
    return `a small ${x.color} ${x.species} ${stageFor(x.day)}${worn.length ? `, ${worn.join(", ")}` : ""}`;
  });
  return `${who.length} cute round magical creatures walking together through a lantern-lit night street: ${who.join("; ")}. Each looks exactly like its reference portrait. Warm glowing paper lanterns, friendly and cozy, storybook watercolor`;
}

/**
 * Paint a walk that is `painting` (idempotent: only the painting → done/failed transition pays).
 * Team-paid. On success every member gets +20 Sparks +20 XP (ref `walk:<id>:<familiarId>`).
 */
export async function paintWalk(id: string, router?: ZeroGRouter): Promise<WalkRow["status"] | null> {
  const d = await db();
  const walk = await d.query.walks.findFirst({ where: eq(w.id, id) });
  if (!walk || walk.status !== "painting") return walk?.status ?? null;
  const members = (await membersOf(d, [id])).get(id) ?? [];
  try {
    const refs = (await Promise.all(members.map((x) => (x.portraitUrl ? loadMedia(x.portraitUrl) : null))))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((x) => toDataUrl(x.bytes, x.contentType));
    const zg = router ?? ZeroGRouter.team(`walk-${id}`);
    const prompt = walkPrompt(members);
    let drawn: Awaited<ReturnType<ZeroGRouter["image"]>>;
    try {
      drawn = await zg.image(prompt, refs);
    } catch (e) {
      // References the provider can't use shouldn't sink the walk; retry text-only.
      if (!refs.length || !(e instanceof AppError) || e.code !== "BAD_REQUEST") throw e;
      log.warn("walk_reference_rejected", { walkId: id, message: e.message });
      drawn = await zg.image(prompt);
    }
    const { contentType, ext } = imageType(drawn.bytes);
    const stored = await storeMedia(`walks/${id}.${ext}`, drawn.bytes, contentType);
    const status = await d.transaction(async (tx) => {
      const [done] = await tx
        .update(w)
        .set({ status: "done", imageUrl: stored.url, finishedAt: new Date(), requestId: drawn.receipt.requestId })
        .where(and(eq(w.id, id), eq(w.status, "painting")))
        .returning({ id: w.id });
      if (!done) return null; // the cron gave up on it meanwhile
      for (const x of members) {
        await grant(tx, x.familiarId, { ...WALK.reward, reason: "walk", ref: `walk:${id}:${x.familiarId}` });
      }
      return "done" as const;
    });
    log.info("walk_painted", { walkId: id, members: members.length, requestId: drawn.receipt.requestId, cost: drawn.receipt.cost });
    return status ?? (await d.query.walks.findFirst({ where: eq(w.id, id) }))?.status ?? null;
  } catch (e) {
    log.error("walk_paint_failed", { walkId: id, error: e instanceof Error ? e.message : String(e) });
    await d
      .update(w)
      .set({ status: "failed", finishedAt: new Date() })
      .where(and(eq(w.id, id), eq(w.status, "painting")));
    return "failed";
  }
}

/** Paint after the response (the walk view already says `painting`; clients poll GET /api/walks/:id). */
export function schedulePaint(id: string) {
  after(async () => {
    try {
      await paintWalk(id);
    } catch (e) {
      log.error("after_walk_paint", { walkId: id, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/** Cron: fail walks stuck painting (> 10 min) and walks still gathering from an earlier day. */
export async function failStaleWalks(now = new Date()) {
  const d = await db();
  const rows = await d
    .update(w)
    .set({ status: "failed", finishedAt: now })
    .where(
      or(
        and(eq(w.status, "painting"), lt(w.startedAt, new Date(now.getTime() - WALK.stuckMs))),
        and(eq(w.status, "gathering"), lt(w.utcDate, utcDate(now))),
      ),
    )
    .returning({ id: w.id, status: w.status });
  if (rows.length) log.warn("walks_failed_stale", { count: rows.length });
  return rows.length;
}
