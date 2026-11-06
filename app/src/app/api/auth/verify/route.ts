import { z } from "zod";
import { issueSession, sessionCookie } from "@/server/auth/session";
import { verifyChallenge } from "@/server/auth/siwe";
import { familiarOf } from "@/server/familiar/service";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ message: z.string().min(20).max(4000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

/** Step 2 of wallet sign-in: verifies the signature and sets the session cookie. */
export const POST = route(async (req) => {
  await rateLimit(`verify:${clientIp(req)}`, 30, 60);
  const { message, signature } = await json(req, Body);
  const address = await verifyChallenge(message, signature as `0x${string}`);
  const token = await issueSession({ address, method: "wallet" });
  return Response.json(
    { session: { address, method: "wallet" }, familiar: await familiarOf(address), token },
    { headers: { "set-cookie": sessionCookie(token) } },
  );
});
