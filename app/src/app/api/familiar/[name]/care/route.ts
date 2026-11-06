type P<T> = { params: Promise<T> };
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { care } from "@/server/game/care";
import { CARE_ACTIONS } from "@/server/game/meters";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ action: z.enum(CARE_ACTIONS) });

/**
 * Tamagotchi care (owner only). pet: free, 20 min cooldown · snack: 5 Sparks, 2 h · play: free +1 Spark, 60 min.
 * 429 COOLDOWN (details.readyAt) while resting; 402 INSUFFICIENT_SPARKS for a snack you can't afford.
 */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`care:${s.address}`, 30, 60);
  const { action } = await json(req, Body);
  return care(s, (await params).name, action);
});
