import { z } from "zod";
import { confirmFeed } from "@/server/feed/service";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/**
 * Credit a feed from its Base tx hash (verified from chain, idempotent). Returns `pending` until the
 * tx has 2 confirmations — poll every ~2 s. Public: the Fed event itself is the proof of payment.
 */
export const POST = route(async (req) => {
  await rateLimit(`feed-confirm:${clientIp(req)}`, 60, 60);
  const { txHash } = await json(req, Body);
  const result = await confirmFeed(txHash as `0x${string}`);
  return Response.json(result, { status: result.status === "pending" ? 202 : 200 });
});
