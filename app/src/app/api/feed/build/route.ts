import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { buildFeed } from "@/server/feed/service";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ quoteId: z.uuid(), mode: z.enum(["eip5792", "sequential"]).default("eip5792") });

/** Wallet calls for the feed: one EIP-5792 batch (default) or ordered transactions. */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`feed-build:${s.address}`, 20, 60);
  const { quoteId, mode } = await json(req, Body);
  return buildFeed({ quoteId, swapper: s.address, mode });
});
