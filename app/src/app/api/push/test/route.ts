import { requireSession } from "@/server/auth/session";
import { route } from "@/server/http";
import { sendTest } from "@/server/push";
import { rateLimit } from "@/server/rateLimit";

/** Send a test notification to your subscribed browsers → `{ sent }` (0 when push is off). */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`push-test:${s.address}`, 5, 600);
  return sendTest(s);
});
