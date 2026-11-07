import "server-only";
import { forbidDemo } from "./session";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getAddress } from "viem";
import { db, schema } from "../db/client";
import { env } from "../env";
import { AppError } from "../errors";
import { log } from "../log";
import type { Session } from "./session";

/**
 * Personal API keys (`fam_<base62 32>`) for ChatGPT / Claude connectors. Only sha256(key) is
 * stored; the key itself is shown once at creation. A key acts as a `wallet` session for its owner.
 */
export const KEY_PREFIX = "fam_";
export const MAX_LIVE_KEYS = 5;
const KEY_CHARS = 32;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_RE = /^fam_[0-9A-Za-z]{32}$/;

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const looksLikeKey = (s: string) => KEY_RE.test(s);

/** Uniform base62 via rejection sampling (248 = 4·62, so no modulo bias). */
export function generateKey(): string {
  let out = "";
  while (out.length < KEY_CHARS) {
    for (const b of randomBytes(48)) {
      if (b < 248 && out.length < KEY_CHARS) out += BASE62[b % 62];
    }
  }
  return `${KEY_PREFIX}${out}`;
}

export const connectorUrl = (key: string) => `${env().APP_URL}/api/mcp/${key}`;

export interface ApiKeyView {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const view = (k: typeof schema.apiKeys.$inferSelect): ApiKeyView => ({
  id: k.id,
  label: k.label,
  prefix: k.prefix,
  createdAt: k.createdAt.toISOString(),
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
});

/** Keys can only be managed from a signed-in browser session, never with another key. */
function assertCanManage(session: Session) {
  if (session.apiKeyId) throw new AppError("FORBIDDEN", "Manage connector keys from the Familiar app, not with a key");
}

export async function listKeys(session: Session) {
  assertCanManage(session);
  const d = await db();
  const rows = await d
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.owner, session.address.toLowerCase()), isNull(schema.apiKeys.revokedAt)))
    .orderBy(desc(schema.apiKeys.createdAt));
  return { keys: rows.map(view) };
}

export async function createKey(session: Session, label: string) {
  forbidDemo(session, "create connector links");
  assertCanManage(session);
  const owner = session.address.toLowerCase();
  const key = generateKey();
  const d = await db();
  const row = await d.transaction(async (tx) => {
    // Serialize creations per owner so the live-key cap holds under concurrency.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`api_keys:${owner}`}))`);
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.owner, owner), isNull(schema.apiKeys.revokedAt)))) as [{ n: number }];
    if (Number(n) >= MAX_LIVE_KEYS) throw new AppError("CONFLICT", `You can have up to ${MAX_LIVE_KEYS} connector keys — revoke one first`);
    const [inserted] = await tx
      .insert(schema.apiKeys)
      .values({ owner, label: label.trim(), prefix: key.slice(0, KEY_PREFIX.length + 6), hash: hashKey(key) })
      .returning();
    return inserted!;
  });
  log.info("api_key_created", { owner, id: row.id });
  return { id: row.id, label: row.label, prefix: row.prefix, key, connectorUrl: connectorUrl(key) };
}

export async function revokeKey(session: Session, id: string) {
  forbidDemo(session, "revoke connector links");
  assertCanManage(session);
  const d = await db();
  const [row] = await d
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.owner, session.address.toLowerCase()), isNull(schema.apiKeys.revokedAt)))
    .returning({ id: schema.apiKeys.id });
  if (!row) throw new AppError("NOT_FOUND", "No such key");
  log.info("api_key_revoked", { id });
  return { revoked: row.id };
}

/** Resolve a `fam_` key to its owner's session (and stamp last use). Null for unknown/revoked keys. */
export async function sessionFromKey(key: string): Promise<Session | null> {
  if (!looksLikeKey(key)) return null;
  const d = await db();
  const [row] = await d
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(schema.apiKeys.hash, hashKey(key)), isNull(schema.apiKeys.revokedAt)))
    .returning({ id: schema.apiKeys.id, owner: schema.apiKeys.owner });
  if (!row) return null;
  return { address: getAddress(row.owner), method: "wallet", apiKeyId: row.id };
}
