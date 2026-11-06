type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { spin } from "@/server/game/service";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** The daily lantern: Sparks, and sometimes an accessory. Once per UTC day. */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`spin:${s.address}`, 10, 60);
  return spin(s, (await params).name);
});
