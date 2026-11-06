import { z } from "zod";
import { signInWithZeroG } from "@/server/auth/iai";
import { issueSession, sessionCookie } from "@/server/auth/session";
import { familiarOf } from "@/server/familiar/service";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ privyToken: z.string().min(20).max(8000) });

/** Sign in with 0G (Privy, 0G's app ID). Visits then spend the user's own daily iAI credits. */
export const POST = route(async (req) => {
  await rateLimit(`iai:${clientIp(req)}`, 20, 60);
  const { privyToken } = await json(req, Body);
  const session = await signInWithZeroG(privyToken);
  const token = await issueSession(session);
  return Response.json(
    { session: { address: session.address, method: session.method }, familiar: await familiarOf(session.address) },
    { headers: { "set-cookie": sessionCookie(token) } },
  );
});
