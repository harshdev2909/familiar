import "server-only";
import { forbidDemo } from "../auth/session";
import { type SQL, and, count, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Session } from "../auth/session";
import { db, schema } from "../db/client";
import { AppError } from "../errors";
import { myFamiliarRow } from "../familiar/service";
import { log } from "../log";
import { itemById } from "./catalog";
import { areFriends, target } from "./social";

/**
 * Accessory swaps: offer one of your accessories for one of theirs. Only between Familiars that
 * know each other (a sighting either way). Accepting swaps the two inventory rows atomically.
 */
export const TRADE = {
  ttlMs: 72 * 3600_000,
  maxPendingOutgoing: 5,
  historyLimit: 10,
} as const;

type TradeRow = typeof schema.trades.$inferSelect;
type TradeStatus = TradeRow["status"];
const t = schema.trades;
const fromF = alias(schema.familiars, "trade_from");
const toF = alias(schema.familiars, "trade_to");

export interface TradeSide {
  label: string;
  species: string;
  portraitUrl: string | null;
}

export interface TradeItem {
  id: string;
  name: string;
  art: string;
}

export interface TradeView {
  id: string;
  status: TradeStatus;
  from: TradeSide;
  to: TradeSide;
  give: TradeItem;
  want: TradeItem;
  createdAt: string;
  expiresAt: string;
}

const item = (id: string): TradeItem => {
  const i = itemById(id);
  return { id, name: i?.name ?? id, art: i?.art ?? "" };
};

const side = (x: { label: string; species: string; portraitUrl: string | null; expiresAt: Date }, now: Date): TradeSide => ({
  label: x.label,
  species: x.species,
  portraitUrl: x.expiresAt.getTime() > now.getTime() ? x.portraitUrl : null,
});

const expiresAt = (createdAt: Date) => new Date(createdAt.getTime() + TRADE.ttlMs);

/** Trades with both Familiars joined in (one query). */
async function selectTrades(where: SQL | undefined, opts: { orderBy?: SQL; limit?: number } = {}) {
  const d = await db();
  const q = d
    .select({
      trade: t,
      from: { label: fromF.label, species: fromF.species, portraitUrl: fromF.portraitUrl, expiresAt: fromF.expiresAt },
      to: { label: toF.label, species: toF.species, portraitUrl: toF.portraitUrl, expiresAt: toF.expiresAt },
    })
    .from(t)
    .innerJoin(fromF, eq(fromF.id, t.fromFamiliarId))
    .innerJoin(toF, eq(toF.id, t.toFamiliarId))
    .where(where)
    .orderBy(opts.orderBy ?? desc(t.createdAt));
  const rows = opts.limit ? await q.limit(opts.limit) : await q;
  const now = new Date();
  return rows.map((r) => tradeView(r.trade, r.from, r.to, now));
}

export function tradeView(
  tr: TradeRow,
  from: Parameters<typeof side>[0],
  to: Parameters<typeof side>[0],
  now = new Date(),
): TradeView {
  const exp = expiresAt(tr.createdAt);
  // Reported as expired even before the lazy update has written it.
  const status: TradeStatus = tr.status === "pending" && exp.getTime() <= now.getTime() ? "expired" : tr.status;
  return {
    id: tr.id,
    status,
    from: side(from, now),
    to: side(to, now),
    give: item(tr.giveItem),
    want: item(tr.wantItem),
    createdAt: tr.createdAt.toISOString(),
    expiresAt: exp.toISOString(),
  };
}

async function loadTrade(id: string): Promise<TradeView> {
  const [view] = await selectTrades(eq(t.id, id));
  if (!view) throw new AppError("NOT_FOUND", "No such trade");
  return view;
}

/** Lazily mark pending offers older than 72 h as expired (resolved at their expiry time). */
async function expireStale(where?: SQL) {
  const d = await db();
  await d
    .update(t)
    .set({ status: "expired", resolvedAt: sql`${t.createdAt} + interval '72 hours'` })
    .where(and(eq(t.status, "pending"), lt(t.createdAt, new Date(Date.now() - TRADE.ttlMs)), where));
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertId = (id: string) => {
  if (!uuidRe.test(id)) throw new AppError("NOT_FOUND", "No such trade");
};

/** Who owns which of the two items, among the two Familiars. */
async function holdings(conn: Pick<Awaited<ReturnType<typeof db>>, "select">, ids: string[], items: string[]) {
  const rows = await conn
    .select({ familiarId: schema.inventory.familiarId, itemId: schema.inventory.itemId })
    .from(schema.inventory)
    .where(and(inArray(schema.inventory.familiarId, ids), inArray(schema.inventory.itemId, items)));
  return (familiarId: string, itemId: string) => rows.some((r) => r.familiarId === familiarId && r.itemId === itemId);
}

export async function createTrade(session: Session, input: { to: string; give: string; want: string }): Promise<{ trade: TradeView }> {
  forbidDemo(session, "trade");
  const me = await myFamiliarRow(session);
  const them = await target(input.to, me);
  const give = itemById(input.give);
  const want = itemById(input.want);
  if (!give || !want) throw new AppError("BAD_REQUEST", "Pick accessories from the shop catalog");
  const d = await db();
  const id = await d.transaction(async (tx) => {
    // Serialize this sender's offers so the pending cap holds under concurrency.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trades:${me.id}`}))`);
    if (!(await areFriends(tx, me.id, them.id))) throw new AppError("NOT_FRIENDS", `Spot ${them.label} (or be spotted) before trading`);
    const has = await holdings(tx, [me.id, them.id], [give.id, want.id]);
    if (!has(me.id, give.id)) throw new AppError("BAD_REQUEST", `${me.label} doesn't have the ${give.name.toLowerCase()}`);
    if (!has(them.id, want.id)) throw new AppError("BAD_REQUEST", `${them.label} doesn't have the ${want.name.toLowerCase()}`);
    if (has(me.id, want.id)) throw new AppError("BAD_REQUEST", `${me.label} already has the ${want.name.toLowerCase()}`);
    if (has(them.id, give.id)) throw new AppError("BAD_REQUEST", `${them.label} already has the ${give.name.toLowerCase()}`);
    const [open] = (await tx
      .select({ n: count() })
      .from(t)
      .where(and(eq(t.fromFamiliarId, me.id), eq(t.status, "pending"), gt(t.createdAt, new Date(Date.now() - TRADE.ttlMs))))) as [{ n: number }];
    if (Number(open.n) >= TRADE.maxPendingOutgoing) throw new AppError("CONFLICT", `You already have ${TRADE.maxPendingOutgoing} open offers — wait for an answer or cancel one`);
    const [row] = await tx.insert(t).values({ fromFamiliarId: me.id, toFamiliarId: them.id, giveItem: give.id, wantItem: want.id }).returning({ id: t.id });
    return row!.id;
  });
  log.info("trade_offered", { tradeId: id, from: me.label, to: them.label, give: give.id, want: want.id });
  return { trade: await loadTrade(id) };
}

/** Your open offers (incoming + outgoing) and the last 10 resolved ones. */
export async function listTrades(session: Session): Promise<{ incoming: TradeView[]; outgoing: TradeView[]; history: TradeView[] }> {
  const me = await myFamiliarRow(session);
  const mine = or(eq(t.fromFamiliarId, me.id), eq(t.toFamiliarId, me.id));
  await expireStale(mine);
  const [open, history] = await Promise.all([
    selectTrades(and(mine, eq(t.status, "pending"))),
    selectTrades(and(mine, ne(t.status, "pending")), { orderBy: sql`${t.resolvedAt} desc nulls last`, limit: TRADE.historyLimit }),
  ]);
  return {
    incoming: open.filter((x) => x.to.label === me.label && x.status === "pending"),
    outgoing: open.filter((x) => x.from.label === me.label && x.status === "pending"),
    history,
  };
}

function wrongParty(tr: Pick<TradeRow, "fromFamiliarId" | "toFamiliarId">, meId: string, need: "to" | "from", verb: string): never {
  const party = tr.fromFamiliarId === meId || tr.toFamiliarId === meId;
  if (!party) throw new AppError("NOT_FOUND", "No such trade");
  throw new AppError("FORBIDDEN", need === "to" ? `Only the Familiar it was offered to can ${verb} it` : `Only the Familiar that offered it can ${verb} it`);
}

/**
 * Accept (recipient): in one transaction, re-check that both still hold their item (and neither
 * holds the other's), move the two inventory rows across, take the items off if worn, and resolve.
 */
export async function acceptTrade(session: Session, id: string): Promise<{ trade: TradeView }> {
  forbidDemo(session, "trade");
  assertId(id);
  const me = await myFamiliarRow(session);
  await expireStale(eq(t.id, id));
  const d = await db();
  const outcome = await d.transaction(async (tx) => {
    const [tr] = await tx.select().from(t).where(eq(t.id, id)).for("update");
    if (!tr) throw new AppError("NOT_FOUND", "No such trade");
    if (tr.toFamiliarId !== me.id) wrongParty(tr, me.id, "to", "accept");
    if (tr.status !== "pending") throw new AppError("CONFLICT", `This offer is already ${tr.status}`);
    // Lock both Familiars in a fixed order (no deadlocks with a crossing trade).
    const fams = await tx
      .select({ id: schema.familiars.id, equipped: schema.familiars.equipped })
      .from(schema.familiars)
      .where(inArray(schema.familiars.id, [tr.fromFamiliarId, tr.toFamiliarId]))
      .orderBy(schema.familiars.id)
      .for("update");
    const has = await holdings(tx, [tr.fromFamiliarId, tr.toFamiliarId], [tr.giveItem, tr.wantItem]);
    const valid = has(tr.fromFamiliarId, tr.giveItem) && has(tr.toFamiliarId, tr.wantItem) && !has(tr.fromFamiliarId, tr.wantItem) && !has(tr.toFamiliarId, tr.giveItem);
    if (!valid) {
      await tx.update(t).set({ status: "cancelled", resolvedAt: new Date() }).where(eq(t.id, id));
      return "stale" as const;
    }
    const inv = schema.inventory;
    await tx.update(inv).set({ familiarId: tr.toFamiliarId }).where(and(eq(inv.familiarId, tr.fromFamiliarId), eq(inv.itemId, tr.giveItem)));
    await tx.update(inv).set({ familiarId: tr.fromFamiliarId }).where(and(eq(inv.familiarId, tr.toFamiliarId), eq(inv.itemId, tr.wantItem)));
    for (const fam of fams) {
      const leaving = fam.id === tr.fromFamiliarId ? tr.giveItem : tr.wantItem;
      const equipped = fam.equipped ?? {};
      if (!Object.values(equipped).includes(leaving)) continue;
      const next = Object.fromEntries(Object.entries(equipped).filter(([, v]) => v !== leaving));
      await tx.update(schema.familiars).set({ equipped: next, updatedAt: new Date() }).where(eq(schema.familiars.id, fam.id));
    }
    await tx.update(t).set({ status: "accepted", resolvedAt: new Date() }).where(eq(t.id, id));
    return "accepted" as const;
  });
  if (outcome === "stale") throw new AppError("CONFLICT", "Those accessories have changed hands since the offer — it was cancelled");
  log.info("trade_accepted", { tradeId: id, by: me.label });
  return { trade: await loadTrade(id) };
}

/** Decline (recipient) or cancel (sender) a pending offer. */
export async function resolveTrade(session: Session, id: string, action: "decline" | "cancel"): Promise<{ trade: TradeView }> {
  forbidDemo(session, "trade");
  assertId(id);
  const me = await myFamiliarRow(session);
  await expireStale(eq(t.id, id));
  const d = await db();
  const party = action === "decline" ? eq(t.toFamiliarId, me.id) : eq(t.fromFamiliarId, me.id);
  const status = action === "decline" ? "declined" : "cancelled";
  const [row] = await d
    .update(t)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(t.id, id), eq(t.status, "pending"), party))
    .returning({ id: t.id });
  if (!row) {
    const tr = await d.query.trades.findFirst({ where: eq(t.id, id) });
    if (!tr) throw new AppError("NOT_FOUND", "No such trade");
    const mineToResolve = action === "decline" ? tr.toFamiliarId === me.id : tr.fromFamiliarId === me.id;
    if (!mineToResolve) wrongParty(tr, me.id, action === "decline" ? "to" : "from", action);
    throw new AppError("CONFLICT", `This offer is already ${tr.status}`);
  }
  log.info(`trade_${status}`, { tradeId: id, by: me.label });
  return { trade: await loadTrade(id) };
}

/** Cron: mark every stale pending offer expired. */
export const expireTrades = () => expireStale();
