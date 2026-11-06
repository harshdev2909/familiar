type P<T> = { params: Promise<T> };
import { sessionFromKey } from "@/server/auth/apiKeys";
import { route } from "@/server/http";
import { serveMcp, unauthorizedMcp } from "@/server/mcp/server";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/**
 * MCP with the personal key in the URL (`/api/mcp/fam_…`), for connector UIs that only take a URL
 * ("no auth" custom connectors in ChatGPT / Claude). Treat the URL as a secret.
 */
const handle = route<P<{ key: string }>>(async (req, { params }) => {
  const session = await sessionFromKey((await params).key);
  if (!session) return unauthorizedMcp();
  await rateLimit(`mcp:${session.apiKeyId}`, 120, 60);
  return serveMcp(req, session);
});

export { handle as DELETE, handle as GET, handle as POST };
