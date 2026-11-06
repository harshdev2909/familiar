import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { MAX_FEED_USD, quoteFeed } from "@/server/feed/service";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ name: z.string().min(1), usd: z.number().min(1).max(MAX_FEED_USD).default(1) });

/** Uniswap quote: $usd USDC → W0G on Base for the signed-in wallet. Valid ~30 s. */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`feed-quote:${s.address}`, 30, 60);
  const { name, usd } = await json(req, Body);
  return quoteFeed({ label: name, swapper: s.address, usd });
});
