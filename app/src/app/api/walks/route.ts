import { requireSession } from "@/server/auth/session";
import { createWalk } from "@/server/game/walks";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Host a night walk (one per Familiar per UTC day, 409 ALREADY_WALKED; global daily cap, 429). Share `walk.inviteUrl`. */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`walk-create:${s.address}`, 10, 3600);
  return createWalk(s);
});
