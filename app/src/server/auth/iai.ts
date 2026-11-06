import "server-only";
import { getAddress } from "viem";
import { db, schema } from "../db/client";
import { AppError } from "../errors";
import { nextRefresh } from "../familiar/rules";
import { type Session } from "./session";
import { ZeroGRouter, exchangePrivyToken } from "../zerog/router";

/**
 * "Sign in with 0G": the frontend logs in with Privy using 0G's app ID and sends us the Privy access
 * token. 0G's router verifies it and returns a session for the user's own 0G account; inference made
 * with that session spends the user's daily iAI credits.
 */
export async function signInWithZeroG(privyToken: string): Promise<Session> {
  const { zgToken, walletAddress } = await exchangePrivyToken(privyToken);
  const address = getAddress(walletAddress);
  const d = await db();
  await d.insert(schema.users).values({ address: address.toLowerCase() }).onConflictDoNothing();
  return { address, method: "iai", zgUserToken: zgToken };
}

/** The signed-in user's 0G credit balance (iAI sessions only). */
export async function iaiBalance(session: Session) {
  if (session.method !== "iai" || !session.zgUserToken) throw new AppError("FORBIDDEN", "Sign in with 0G to see iAI credits");
  const b = await new ZeroGRouter({ token: session.zgUserToken }).balance();
  return { ...b, refreshAt: nextRefresh().toISOString() };
}
