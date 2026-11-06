/**
 * Tamagotchi care. Meters (0–100) are derived from timestamps on read, so there is no cron:
 * - fullness falls 6/h since the last snack
 * - joy falls 5/h since the last pet or play
 * - energy is full on a day you visited and falls 4/h from the following midnight (min 10)
 * Without a care action yet, fullness and joy fall from the last visit, then from the hatch.
 */
export type CareAction = "pet" | "snack" | "play";
export const CARE_ACTIONS = ["pet", "snack", "play"] as const satisfies readonly CareAction[];

export const CARE: Record<CareAction, { cooldownMs: number; cost: number; sparks: number; xp: number }> = {
  pet: { cooldownMs: 20 * 60_000, cost: 0, sparks: 0, xp: 2 },
  snack: { cooldownMs: 2 * 3600_000, cost: 5, sparks: 0, xp: 3 },
  play: { cooldownMs: 60 * 60_000, cost: 0, sparks: 1, xp: 3 },
};

const RATES = { fullness: 6, joy: 5, energy: 4 } as const;
const ENERGY_FLOOR = 10;
const HOUR = 3600_000;

export interface CareInput {
  lastPetAt: Date | null;
  lastSnackAt: Date | null;
  lastPlayAt: Date | null;
  lastVisitAt: Date | null;
  lastVisitDate: string | null;
  createdAt: Date;
}

export type Need = "hungry" | "lonely" | "sleepy";

export interface CareView {
  fullness: number;
  joy: number;
  energy: number;
  hearts: { fullness: number; joy: number; energy: number };
  need: Need | null;
  /** null = can do it now; otherwise the ISO time it's ready. */
  ready: { pet: string | null; snack: string | null; play: string | null };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const hoursSince = (t: Date, now: Date) => Math.max(0, (now.getTime() - t.getTime()) / HOUR);
const latest = (...ds: (Date | null)[]) => ds.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

export const hearts = (meter: number) => clamp(Math.ceil(meter / 25), 0, 4);

/** When `action` is next allowed, or null if it is allowed now. */
export function readyAt(action: CareAction, last: Date | null, now: Date): Date | null {
  if (!last) return null;
  const at = new Date(last.getTime() + CARE[action].cooldownMs);
  return at > now ? at : null;
}

export function careView(f: CareInput, now = new Date()): CareView {
  const base = f.lastVisitAt ?? f.createdAt;
  const fullness = Math.round(clamp(100 - RATES.fullness * hoursSince(f.lastSnackAt ?? base, now)));
  const joy = Math.round(clamp(100 - RATES.joy * hoursSince(latest(f.lastPetAt, f.lastPlayAt) ?? base, now)));
  const today = now.toISOString().slice(0, 10);
  let energy: number;
  if (f.lastVisitDate === today) energy = 100;
  else {
    // Rested through the visit day; tiredness builds from the next midnight.
    const from = f.lastVisitDate ? new Date(Date.parse(`${f.lastVisitDate}T00:00:00Z`) + 24 * HOUR) : f.createdAt;
    energy = Math.round(clamp(100 - RATES.energy * hoursSince(from, now), ENERGY_FLOOR));
  }
  const lowest = (
    [
      ["hungry", fullness],
      ["lonely", joy],
      ["sleepy", energy],
    ] as const
  ).reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    fullness,
    joy,
    energy,
    hearts: { fullness: hearts(fullness), joy: hearts(joy), energy: hearts(energy) },
    need: lowest[1] < 40 ? lowest[0] : null,
    ready: {
      pet: readyAt("pet", f.lastPetAt, now)?.toISOString() ?? null,
      snack: readyAt("snack", f.lastSnackAt, now)?.toISOString() ?? null,
      play: readyAt("play", f.lastPlayAt, now)?.toISOString() ?? null,
    },
  };
}
