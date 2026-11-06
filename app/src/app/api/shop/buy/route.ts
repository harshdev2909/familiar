import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { buy } from "@/server/game/service";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ itemId: z.string().min(1).max(40) });

/** Spend Sparks on an accessory (atomic; one of each per Familiar). */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`buy:${s.address}`, 30, 60);
  const { itemId } = await json(req, Body);
  return buy(s, itemId);
});
