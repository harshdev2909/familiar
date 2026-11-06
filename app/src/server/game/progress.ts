/** Trainer-style levels: level L needs 25·L·(L−1) XP in total (0, 50, 150, 300, 500, …). */
export const xpForLevel = (level: number) => 25 * level * (level - 1);

export function levelFor(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, intoLevel: xp - floor, levelSize: next - floor, toNext: next - xp };
}

export const REWARDS = {
  hatch: { sparks: 50, xp: 20 },
  visit: { sparks: 10, xp: 20 },
  /** Extra sparks per consecutive night, capped. */
  streakBonusPerNight: 2,
  streakBonusCap: 14,
  spin: { min: 10, max: 30, itemChance: 0.12 },
  questXp: 10,
} as const;

export const visitSparks = (streak: number) => REWARDS.visit.sparks + Math.min(REWARDS.streakBonusCap, Math.max(0, streak - 1) * REWARDS.streakBonusPerNight);

/** ISO-8601 week key, e.g. 2026-W45 (UTC). */
export function isoWeek(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
