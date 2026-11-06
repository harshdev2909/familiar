import "server-only";
import { randomInt } from "node:crypto";
import { and, count, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { Session } from "../auth/session";
import { type DB, db, schema } from "../db/client";
import { env } from "../env";
import { AppError } from "../errors";
import { utcDate } from "../familiar/rules";
import { log } from "../log";
import { ITEMS, type Item, type Slot, activeFestival, itemById } from "./catalog";
import { REWARDS, isoWeek, levelFor } from "./progress";
import { eventById, eventWindow, eventsToday, isLive } from "./events";

type FamiliarRow = typeof schema.familiars.$inferSelect;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export const festival = () => activeFestival(utcDate(), env().FESTIVAL);

export async function ownedFamiliar(session: Session, label?: string): Promise<FamiliarRow> {
  const d = await db();
  const f = await d.query.familiars.findFirst({
    where: label ? eq(schema.familiars.label, label.toLowerCase()) : eq(schema.familiars.owner, session.address.toLowerCase()),
  });
  if (!f) throw new AppError("NOT_FOUND", "Hatch a Familiar first");
  if (f.owner !== session.address.toLowerCase()) throw new AppError("FORBIDDEN", "This Familiar is bonded to someone else");
  return f;
}

/**
 * Credit (or debit) Sparks and XP exactly once per `ref`. Returns false if `ref` was already used.
 * Must run inside a transaction so the ledger row and the balance move together.
 */
export async function grant(tx: Tx | DB, familiarId: string, g: { sparks: number; xp?: number; reason: string; ref: string }) {
  const inserted = await tx
    .insert(schema.sparkLedger)
    .values({ familiarId, delta: g.sparks, reason: g.reason, ref: g.ref })
    .onConflictDoNothing()
    .returning({ id: schema.sparkLedger.id });
  if (!inserted.length) return false;
  await tx
    .update(schema.familiars)
    .set({ sparks: sql`${schema.familiars.sparks} + ${g.sparks}`, xp: sql`${schema.familiars.xp} + ${g.xp ?? 0}` })
    .where(eq(schema.familiars.id, familiarId));
  return true;
}

export async function grantOnce(familiarId: string, g: { sparks: number; xp?: number; reason: string; ref: string }) {
  const d = await db();
  return d.transaction((tx) => grant(tx, familiarId, g));
}

// ---------------------------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------------------------

export interface ShopItemView extends Item {
  owned: boolean;
  equipped: boolean;
  available: boolean;
}

export async function shop(session: Session | null) {
  const fest = festival();
  let f: FamiliarRow | undefined;
  let owned = new Set<string>();
  if (session) {
    const d = await db();
    f = await d.query.familiars.findFirst({ where: eq(schema.familiars.owner, session.address.toLowerCase()) });
    if (f) owned = new Set((await d.select({ id: schema.inventory.itemId }).from(schema.inventory).where(eq(schema.inventory.familiarId, f.id))).map((r) => r.id));
  }
  const equipped = new Set(Object.values(f?.equipped ?? {}));
  const items: ShopItemView[] = ITEMS.map((i) => ({ ...i, owned: owned.has(i.id), equipped: equipped.has(i.id), available: !i.festival || fest?.id === i.festival }));
  return { festival: fest, sparks: f?.sparks ?? null, familiar: f?.label ?? null, items };
}

export async function buy(session: Session, itemId: string) {
  const item = itemById(itemId);
  if (!item) throw new AppError("NOT_FOUND", "That item isn't in the shop");
  if (item.festival && festival()?.id !== item.festival) throw new AppError("CONFLICT", `${item.name} is only sold during ${item.festival === "diwali" ? "Diwali" : "its festival"}`);
  const f = await ownedFamiliar(session);
  const d = await db();
  return d.transaction(async (tx) => {
    const [mine] = await tx.select({ id: schema.inventory.id }).from(schema.inventory).where(and(eq(schema.inventory.familiarId, f.id), eq(schema.inventory.itemId, item.id)));
    if (mine) throw new AppError("CONFLICT", `${f.label} already has the ${item.name.toLowerCase()}`);
    const [paid] = await tx
      .update(schema.familiars)
      .set({ sparks: sql`${schema.familiars.sparks} - ${item.price}` })
      .where(and(eq(schema.familiars.id, f.id), gte(schema.familiars.sparks, item.price)))
      .returning({ sparks: schema.familiars.sparks });
    if (!paid) throw new AppError("PAYMENT_REQUIRED", `Not enough Sparks — ${item.name} costs ${item.price}`, { price: item.price, sparks: f.sparks });
    await tx.insert(schema.inventory).values({ familiarId: f.id, itemId: item.id, source: "shop" });
    await tx.insert(schema.sparkLedger).values({ familiarId: f.id, delta: -item.price, reason: `buy:${item.id}`, ref: `buy:${f.id}:${item.id}` });
    log.info("shop_buy", { label: f.label, item: item.id, price: item.price });
    return { item: item.id, sparks: paid.sparks };
  });
}

/** Put an owned item on (replacing whatever is in its slot), or take a slot off with itemId = null. */
export async function equip(session: Session, label: string, slot: Slot, itemId: string | null) {
  const f = await ownedFamiliar(session, label);
  const d = await db();
  if (itemId) {
    const item = itemById(itemId);
    if (!item || item.slot !== slot) throw new AppError("BAD_REQUEST", "That item doesn't go there");
    const [mine] = await d.select({ id: schema.inventory.id }).from(schema.inventory).where(and(eq(schema.inventory.familiarId, f.id), eq(schema.inventory.itemId, itemId)));
    if (!mine) throw new AppError("FORBIDDEN", "Buy it first");
  }
  const next = { ...(f.equipped ?? {}) };
  if (itemId) next[slot] = itemId;
  else delete next[slot];
  await d.update(schema.familiars).set({ equipped: next, updatedAt: new Date() }).where(eq(schema.familiars.id, f.id));
  return { equipped: next };
}

/** The phrases for whatever the Familiar is wearing, for the portrait prompt. */
export const wearing = (equipped: Record<string, string> | null | undefined) =>
  Object.values(equipped ?? {})
    .map((id) => itemById(id)?.wear)
    .filter(Boolean) as string[];

// ---------------------------------------------------------------------------------------------
// Daily lantern (spin)
// ---------------------------------------------------------------------------------------------

export async function spin(session: Session, label: string) {
  const f = await ownedFamiliar(session, label);
  const today = utcDate();
  if (f.lastSpinDate === today) throw new AppError("ALREADY_VISITED_TODAY", "The lantern is resting — spin again after 00:00 UTC");
  const d = await db();
  return d.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.familiars)
      .set({ lastSpinDate: today })
      .where(and(eq(schema.familiars.id, f.id), sql`${schema.familiars.lastSpinDate} is distinct from ${today}`))
      .returning({ id: schema.familiars.id });
    if (!claimed) throw new AppError("ALREADY_VISITED_TODAY", "The lantern is resting — spin again after 00:00 UTC");
    const sparks = randomInt(REWARDS.spin.min, REWARDS.spin.max + 1);
    await grant(tx, f.id, { sparks, xp: 5, reason: "spin", ref: `spin:${f.id}:${today}` });
    let item: Item | null = null;
    if (randomInt(0, 1000) < REWARDS.spin.itemChance * 1000) {
      const owned = new Set((await tx.select({ id: schema.inventory.itemId }).from(schema.inventory).where(eq(schema.inventory.familiarId, f.id))).map((r) => r.id));
      const fest = festival();
      const pool = ITEMS.filter((i) => !owned.has(i.id) && (!i.festival || fest?.id === i.festival));
      if (pool.length) {
        item = pool[randomInt(0, pool.length)]!;
        await tx.insert(schema.inventory).values({ familiarId: f.id, itemId: item.id, source: "spin" }).onConflictDoNothing();
      }
    }
    return { sparks, item: item ? { id: item.id, name: item.name, art: item.art } : null };
  });
}

// ---------------------------------------------------------------------------------------------
// Quests + badges
// ---------------------------------------------------------------------------------------------

export interface QuestView {
  id: string;
  kind: "daily" | "weekly" | "event";
  title: string;
  description: string;
  progress: number;
  goal: number;
  reward: number;
  claimed: boolean;
  claimable: boolean;
  period: string;
}

/** First row's `n` of a count query (quest progress; the queries run in one parallel round). */
const countOf = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);

async function questState(f: FamiliarRow) {
  const d = await db();
  const today = utcDate();
  const fest = festival();
  const eToday = eventsToday();
  const hackathon = isLive("ethglobal-mumbai", eToday) ? eventWindow(eventById("ethglobal-mumbai"), eToday) : null;
  const devcon = isLive("devcon-8", eToday) ? eventWindow(eventById("devcon-8"), eToday) : null;
  const dayStart = new Date(`${today}T00:00:00Z`);
  const zero = Promise.resolve([{ n: 0 }]);
  const [spotsToday, giftsToday, hackathonSpots, devconVisits] = await Promise.all([
    countOf(d.select({ n: count() }).from(schema.sightings).where(and(eq(schema.sightings.spotterFamiliarId, f.id), gte(schema.sightings.createdAt, dayStart)))),
    countOf(d.select({ n: count() }).from(schema.gifts).where(and(eq(schema.gifts.fromFamiliarId, f.id), eq(schema.gifts.utcDate, today)))),
    countOf(
      hackathon
        ? d
            .select({ n: count() })
            .from(schema.sightings)
            .where(and(eq(schema.sightings.spotterFamiliarId, f.id), gte(schema.sightings.createdAt, hackathon.from), lt(schema.sightings.createdAt, hackathon.to)))
        : zero,
    ),
    countOf(
      devcon
        ? d
            .select({ n: count() })
            .from(schema.visits)
            .where(and(eq(schema.visits.familiarId, f.id), gte(schema.visits.utcDate, devcon.fromDate), lte(schema.visits.utcDate, devcon.toDate), inArray(schema.visits.status, ["chain_pending", "complete"])))
        : zero,
    ),
  ]);
  const caredToday = [f.lastPetAt, f.lastSnackAt, f.lastPlayAt].filter((t) => t && utcDate(t) === today).length;
  const [owned, eventVisits, claims] = await Promise.all([
    d.select({ id: schema.inventory.itemId }).from(schema.inventory).where(eq(schema.inventory.familiarId, f.id)),
    fest
      ? d
          .select({ n: count() })
          .from(schema.visits)
          .where(and(eq(schema.visits.familiarId, f.id), gte(schema.visits.utcDate, fest.start), sql`${schema.visits.utcDate} <= ${fest.end}`, inArray(schema.visits.status, ["chain_pending", "complete"])))
      : Promise.resolve([{ n: 0 }]),
    d.select().from(schema.questClaims).where(eq(schema.questClaims.familiarId, f.id)),
  ]);
  const ownedSet = new Set(owned.map((r) => r.id));
  const festiveOwned = ITEMS.filter((i) => i.festival === fest?.id && ownedSet.has(i.id)).length;
  const festiveWorn = Object.values(f.equipped ?? {}).some((id) => itemById(id)?.festival === fest?.id);
  const claimedKey = new Set(claims.map((c) => `${c.questId}@${c.period}`));
  const week = isoWeek(today);

  const defs: Omit<QuestView, "claimed" | "claimable">[] = [
    { id: "daily-visit", kind: "daily", title: "Talk tonight", description: `Tell ${f.label} about your day.`, progress: f.lastVisitDate === today ? 1 : 0, goal: 1, reward: 10, period: today },
    { id: "daily-spin", kind: "daily", title: "Spin the lantern", description: "Your daily lantern has something for you.", progress: f.lastSpinDate === today ? 1 : 0, goal: 1, reward: 5, period: today },
    { id: "daily-spot", kind: "daily", title: "Out exploring", description: "Spot another Familiar on the map.", progress: Math.min(spotsToday, 1), goal: 1, reward: 10, period: today },
    { id: "daily-gift", kind: "daily", title: "A little gift", description: "Send a gift to a Familiar you've spotted.", progress: Math.min(giftsToday, 1), goal: 1, reward: 10, period: today },
    { id: "daily-care", kind: "daily", title: "Full care", description: `Pet, play with and feed ${f.label} a snack today.`, progress: caredToday, goal: 3, reward: 15, period: today },
    { id: "weekly-streak", kind: "weekly", title: "Three nights in a row", description: "Visit three nights running.", progress: Math.min(f.streak, 3), goal: 3, reward: 40, period: week },
  ];
  if (hackathon) {
    defs.push({ id: "hackathon-spot", kind: "event", title: "Hacker meetup", description: "Spot three Familiars during ETHGlobal Mumbai.", progress: Math.min(hackathonSpots, 3), goal: 3, reward: 60, period: "ethglobal-mumbai" });
  }
  if (devcon) {
    defs.push({ id: "devcon-visit", kind: "event", title: "A Devcon night", description: "Visit during Devcon 8.", progress: Math.min(devconVisits, 1), goal: 1, reward: 40, period: "devcon-8" });
  }
  if (fest) {
    defs.push(
      { id: "diwali-visit", kind: "event", title: "A Diwali night", description: "Visit during Diwali.", progress: Math.min(Number(eventVisits[0]?.n ?? 0), 1), goal: 1, reward: 50, period: fest.period },
      { id: "diwali-light", kind: "event", title: "Light it up", description: "Put a Diwali accessory on your Familiar.", progress: festiveWorn ? 1 : 0, goal: 1, reward: 30, period: fest.period },
      { id: "diwali-collect", kind: "event", title: "Festival collector", description: "Collect three Diwali accessories.", progress: Math.min(festiveOwned, 3), goal: 3, reward: 75, period: fest.period },
    );
  }
  const quests: QuestView[] = defs.map((q) => {
    const claimed = claimedKey.has(`${q.id}@${q.period}`);
    return { ...q, claimed, claimable: !claimed && q.progress >= q.goal };
  });
  const badges = [
    { id: "first-night", name: "First night", earned: f.day >= 1 },
    { id: "week-of-nights", name: "Seven nights", earned: f.streak >= 7 },
    { id: "sprite", name: "Sprite", earned: f.day >= 7 },
    { id: "guardian", name: "Guardian", earned: f.day >= 14 },
    { id: "diwali-2026", name: "Diwali 2026", earned: claims.some((c) => c.questId === "diwali-collect" && c.period === "diwali-2026") },
  ];
  return { quests, badges, festival: fest };
}

export async function quests(session: Session) {
  const f = await ownedFamiliar(session);
  return { ...(await questState(f)), sparks: f.sparks, level: levelFor(f.xp) };
}

export async function claimQuest(session: Session, questId: string) {
  const f = await ownedFamiliar(session);
  const { quests: list } = await questState(f);
  const q = list.find((x) => x.id === questId);
  if (!q) throw new AppError("NOT_FOUND", "No such quest right now");
  if (q.claimed) throw new AppError("CONFLICT", "Already claimed");
  if (!q.claimable) throw new AppError("BAD_REQUEST", "Not finished yet");
  const d = await db();
  await d.transaction(async (tx) => {
    const ins = await tx.insert(schema.questClaims).values({ familiarId: f.id, questId: q.id, period: q.period }).onConflictDoNothing().returning({ id: schema.questClaims.id });
    if (!ins.length) throw new AppError("CONFLICT", "Already claimed");
    await grant(tx, f.id, { sparks: q.reward, xp: REWARDS.questXp, reason: `quest:${q.id}`, ref: `quest:${f.id}:${q.id}:${q.period}` });
  });
  const after = await d.query.familiars.findFirst({ where: eq(schema.familiars.id, f.id) });
  return { claimed: q.id, reward: q.reward, sparks: after?.sparks ?? f.sparks + q.reward };
}
