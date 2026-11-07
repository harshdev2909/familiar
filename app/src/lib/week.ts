/** ISO-8601 weeks (`YYYY-Www`, Monday first), in UTC — the diary's calendar. */

const DAY = 86_400_000;

export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow); // the week's Thursday decides its year
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The Monday (00:00 UTC) of an ISO week. */
export function weekStart(week: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return new Date(NaN);
  const year = Number(m[1]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday1 = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY;
  return new Date(monday1 + (Number(m[2]) - 1) * 7 * DAY);
}

export const shiftWeek = (week: string, by: number) => isoWeek(new Date(weekStart(week).getTime() + by * 7 * DAY));

/** The seven dates (YYYY-MM-DD) of a week, Monday to Sunday. */
export const weekDates = (week: string) => Array.from({ length: 7 }, (_, i) => new Date(weekStart(week).getTime() + i * DAY).toISOString().slice(0, 10));

const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2–8 Nov", "27 Oct – 2 Nov". */
export function weekRange(week: string) {
  const a = weekStart(week);
  const b = new Date(a.getTime() + 6 * DAY);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${fmt.format(b)}`;
  return `${fmt.format(a)} – ${fmt.format(b)}`;
}
