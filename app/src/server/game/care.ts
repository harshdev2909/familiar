import "server-only";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { Session } from "../auth/session";
import { db, schema } from "../db/client";
import { AppError } from "../errors";
import { feedCredits } from "../familiar/service";
import { familiarView } from "../familiar/views";
import { log } from "../log";
import { CARE, type CareAction, readyAt } from "./meters";
import { grant, ownedFamiliar } from "./service";

const COLUMN = {
  pet: schema.familiars.lastPetAt,
  snack: schema.familiars.lastSnackAt,
  play: schema.familiars.lastPlayAt,
} as const;
const FIELD = { pet: "lastPetAt", snack: "lastSnackAt", play: "lastPlayAt" } as const;

/**
 * Pet (free), snack (5 Sparks) or play (free, +1 Spark). The cooldown, the Sparks check and the
 * reward are one transaction: the conditional UPDATE claims the slot and locks the row.
 */
export async function care(session: Session, label: string, action: CareAction) {
  const f = await ownedFamiliar(session, label);
  const cfg = CARE[action];
  const col = COLUMN[action];
  const now = new Date();
  const cutoff = new Date(now.getTime() - cfg.cooldownMs);
  const sparks = cfg.sparks - cfg.cost;
  const d = await db();
  const updated = await d.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.familiars)
      .set({ [FIELD[action]]: now })
      .where(and(eq(schema.familiars.id, f.id), or(isNull(col), lte(col, cutoff)), cfg.cost ? gte(schema.familiars.sparks, cfg.cost) : undefined))
      .returning({ id: schema.familiars.id });
    if (!claimed) {
      const [cur] = await tx.select({ last: col, sparks: schema.familiars.sparks }).from(schema.familiars).where(eq(schema.familiars.id, f.id));
      const ready = readyAt(action, cur?.last ?? null, now);
      if (ready) throw new AppError("COOLDOWN", cooldownMessage(f.label, action, ready, now), { readyAt: ready.toISOString() });
      throw new AppError("INSUFFICIENT_SPARKS", `A snack costs ${cfg.cost} Sparks`, { price: cfg.cost, sparks: cur?.sparks ?? f.sparks });
    }
    await grant(tx, f.id, { sparks, xp: cfg.xp, reason: `care:${action}`, ref: `care:${action}:${f.id}:${now.getTime()}` });
    const [row] = await tx.select().from(schema.familiars).where(eq(schema.familiars.id, f.id));
    return row!;
  });
  log.info("care", { label: f.label, action });
  return { action, reward: { sparks, xp: cfg.xp }, familiar: familiarView(updated, { feedCredits: await feedCredits(f.id) }) };
}

function cooldownMessage(label: string, action: CareAction, ready: Date, now: Date) {
  const mins = Math.max(1, Math.ceil((ready.getTime() - now.getTime()) / 60_000));
  const wait = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  const what = action === "pet" ? `${label} is still purring` : action === "snack" ? `${label} is still full` : `${label} needs a breather`;
  return `${what} — try again in ${wait}`;
}
