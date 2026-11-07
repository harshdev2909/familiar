type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { resolveTrade } from "@/server/game/trades";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Sender only: withdraw a pending offer. 409 CONFLICT when it isn't pending. */
export const POST = route<P<{ id: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`trade-resolve:${s.address}`, 60, 60);
  return resolveTrade(s, (await params).id, "cancel");
});
