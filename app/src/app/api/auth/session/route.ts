import { getSession } from "@/server/auth/session";
import { route } from "@/server/http";

export const GET = route(async (req) => {
  const s = await getSession(req);
  return { session: s ? { address: s.address, method: s.method } : null };
});
