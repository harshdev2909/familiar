import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { nextRefresh, utcDate } from "../familiar/rules";

/**
 * "Spot in person": each Familiar shows a QR code that rotates daily at 00:00 UTC.
 * code = base64url(HMAC-SHA256(K, `${label}:${YYYY-MM-DD}`)) truncated to 16 chars (96 bits),
 * K = SHA-256("meet-code:" + SESSION_SECRET). Nothing is stored: the server recomputes it.
 */
export const MEET_CODE_CHARS = 16;

const meetKey = () => createHash("sha256").update(`meet-code:${env().SESSION_SECRET}`).digest();

export function meetCode(label: string, date = utcDate()): string {
  return createHmac("sha256", meetKey()).update(`${label.toLowerCase()}:${date}`).digest("base64url").slice(0, MEET_CODE_CHARS);
}

/** True when `code` is today's (UTC) code for `label`. Constant-time compare. */
export function verifyMeetCode(label: string, code: string, now = new Date()): boolean {
  if (typeof code !== "string" || code.length !== MEET_CODE_CHARS) return false;
  const expected = Buffer.from(meetCode(label, utcDate(now)));
  const given = Buffer.from(code);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** What the owner's QR code encodes, and when it stops working. */
export function meetCodeView(label: string, now = new Date()) {
  const code = meetCode(label, utcDate(now));
  return { code, url: `${env().APP_URL}/meet/${label}?c=${code}`, expiresAt: nextRefresh(now).toISOString() };
}
