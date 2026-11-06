type P<T> = { params: Promise<T> };
import { normalizeLabel, simulateAgentOverreach } from "@/server/chain/ens";
import { clientIp, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/**
 * Enhanced Access Control demo: simulates the agent key calling setAddr / an unscoped text key
 * (both revert) and a scoped key (succeeds) against the live resolver. Sends nothing.
 */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  await rateLimit(`overreach:${clientIp(req)}`, 30, 60);
  return simulateAgentOverreach(normalizeLabel((await params).name));
});
