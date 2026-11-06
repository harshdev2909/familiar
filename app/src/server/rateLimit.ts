import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "./db/client";
import { AppError } from "./errors";

/**
 * Fixed-window limiter backed by the database (works across serverless instances).
 * Throws RATE_LIMITED when `key` exceeds `max` hits within `windowSec`.
 */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const d = await db();
  const t = schema.rateLimits;
  const [row] = await d
    .insert(t)
    .values({ key, windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        count: sql`case when ${t.windowStart} < now() - make_interval(secs => ${windowSec}) then 1 else ${t.count} + 1 end`,
        windowStart: sql`case when ${t.windowStart} < now() - make_interval(secs => ${windowSec}) then now() else ${t.windowStart} end`,
      },
    })
    .returning({ count: t.count, windowStart: t.windowStart });
  if (row && row.count > max) {
    const retryAfter = Math.max(1, Math.ceil((row.windowStart.getTime() + windowSec * 1000 - Date.now()) / 1000));
    throw new AppError("RATE_LIMITED", "Too many requests — slow down a little", { retryAfter });
  }
}
