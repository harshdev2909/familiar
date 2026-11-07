type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { joinWalk, schedulePaint } from "@/server/game/walks";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/**
 * Join a gathering walk (max 3 with the host, 409 WALK_FULL; one join per Familiar per UTC day,
 * 409 ALREADY_WALKED). The third member starts the painting, which runs after the response.
 */
export const POST = route<P<{ id: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`walk-join:${s.address}`, 30, 60);
  const { walk, painting } = await joinWalk(s, (await params).id);
  if (painting) schedulePaint(walk.id);
  return { walk };
});
