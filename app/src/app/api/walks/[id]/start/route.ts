type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { schedulePaint, startWalk } from "@/server/game/walks";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/** Host only, with at least 2 members: set off now. The painting runs after the response. */
export const POST = route<P<{ id: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`walk-start:${s.address}`, 30, 60);
  const { walk, painting } = await startWalk(s, (await params).id);
  if (painting) schedulePaint(walk.id);
  return { walk };
});
