import { requireSession } from "@/server/auth/session";
import { familiarOf } from "@/server/familiar/service";
import { route } from "@/server/http";

/** The signed-in human and their Familiar (null before hatching). */
export const GET = route(async (req) => {
  const s = await requireSession(req);
  return { session: { address: s.address, method: s.method }, familiar: await familiarOf(s.address) };
});
