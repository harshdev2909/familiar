type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { gift } from "@/server/game/social";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Send a gift to a Familiar you've spotted (once per UTC day): +3 XP for you, +5 Sparks for them. */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`gift:${s.address}`, 30, 60);
  return gift(s, (await params).name);
});
