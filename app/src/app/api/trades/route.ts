import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { createTrade, listTrades } from "@/server/game/trades";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Your open offers (incoming/outgoing) and the last 10 resolved ones. Offers expire after 72 h. */
export const GET = route(async (req) => listTrades(await requireSession(req)));

const Body = z.object({
  to: z.string().trim().min(1).max(64),
  give: z.string().trim().min(1).max(40),
  want: z.string().trim().min(1).max(40),
});

/** Offer one of your accessories for one of theirs (403 NOT_FRIENDS until either of you spotted the other). */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`trade:${s.address}`, 30, 3600);
  return createTrade(s, await json(req, Body));
});
