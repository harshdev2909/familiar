type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { spot } from "@/server/game/social";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Spot another Familiar (once per pair): +5 Sparks +5 XP, +10 more for a species new to your Dex. */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`spot:${s.address}`, 30, 60);
  return spot(s, (await params).name);
});
