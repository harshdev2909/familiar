import { getSession } from "@/server/auth/session";
import { route } from "@/server/http";
import { serveMcp, unauthorizedMcp } from "@/server/mcp/server";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/**
 * MCP (Streamable HTTP, stateless) for ChatGPT / Claude connectors.
 * Auth: `Authorization: Bearer fam_…` (a personal key from /api/keys).
 */
const handle = route(async (req) => {
  const session = await getSession(req);
  if (!session) return unauthorizedMcp();
  await rateLimit(`mcp:${session.apiKeyId ?? session.address}`, 120, 60);
  return serveMcp(req, session);
});

export { handle as DELETE, handle as GET, handle as POST };
