import { z } from "zod";
import { isAddress } from "viem";
import { createChallenge } from "@/server/auth/siwe";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({
  address: z.string().refine((a) => isAddress(a), "invalid address"),
  chainId: z.number().int().positive().optional(),
});

/** Step 1 of wallet sign-in: returns the SIWE message to sign. */
export const POST = route(async (req) => {
  await rateLimit(`nonce:${clientIp(req)}`, 30, 60);
  const { address, chainId } = await json(req, Body);
  return createChallenge(address as `0x${string}`, chainId);
});
