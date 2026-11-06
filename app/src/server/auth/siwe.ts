import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { type Address, type Hex, getAddress } from "viem";
import { createSiweMessage, generateSiweNonce, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { publicClient } from "../chain/clients";
import { db, schema } from "../db/client";
import { env } from "../env";
import { AppError } from "../errors";

const NONCE_TTL_MS = 10 * 60 * 1000;
const STATEMENT = "Sign in to Familiar.";

/** Issue a one-time nonce and the exact message the wallet should sign. */
export async function createChallenge(address: Address, chainId = 8453) {
  const nonce = generateSiweNonce();
  const d = await db();
  await d.insert(schema.authNonces).values({ nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS) });
  const url = new URL(env().APP_URL);
  const message = createSiweMessage({
    address: getAddress(address),
    chainId,
    domain: url.host,
    uri: url.origin,
    nonce,
    statement: STATEMENT,
    version: "1",
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + NONCE_TTL_MS),
  });
  return { message, nonce };
}

/**
 * Verify a signed SIWE message: domain, nonce (single use, unexpired) and signature.
 * Uses `verifySiweMessage` on Base so smart-contract wallets (ERC-1271/6492) also work.
 */
export async function verifyChallenge(message: string, signature: Hex): Promise<Address> {
  const parsed = parseSiweMessage(message);
  const url = new URL(env().APP_URL);
  if (!parsed.address || !parsed.nonce) throw new AppError("BAD_REQUEST", "Malformed sign-in message");
  if (!validateSiweMessage({ message: parsed, domain: url.host, time: new Date() })) {
    throw new AppError("UNAUTHENTICATED", "Sign-in message is expired or for another domain");
  }
  const d = await db();
  const consumed = await d
    .update(schema.authNonces)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authNonces.nonce, parsed.nonce), isNull(schema.authNonces.usedAt), gt(schema.authNonces.expiresAt, new Date())))
    .returning({ nonce: schema.authNonces.nonce });
  if (consumed.length === 0) throw new AppError("UNAUTHENTICATED", "Sign-in nonce is invalid or already used");

  const ok = await publicClient("base").verifySiweMessage({ message, signature, domain: url.host, nonce: parsed.nonce });
  if (!ok) throw new AppError("UNAUTHENTICATED", "Signature does not match the address");
  const address = getAddress(parsed.address);
  await d.insert(schema.users).values({ address: address.toLowerCase() }).onConflictDoNothing();
  return address;
}
