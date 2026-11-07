import { readFamiliar } from "@/server/chain/ens";
import { issueSession, sessionCookie } from "@/server/auth/session";
import { demoLabels, env } from "@/server/env";
import { AppError } from "@/server/errors";
import { familiarOf } from "@/server/familiar/service";
import { clientIp, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/**
 * "Try the demo Familiar": a signature-less session for the owner of the first DEMO_LABELS name.
 * Off unless DEMO_LOGIN_ENABLED. The session only acts inside this app (it signs nothing onchain),
 * and demo Familiars are free and exempt from the daily limit.
 */
export const POST = route(async (req) => {
  await rateLimit(`demo:${clientIp(req)}`, 20, 3600);
  const label = [...demoLabels()][0];
  if (!env().DEMO_LOGIN_ENABLED || !label) throw new AppError("NOT_FOUND", "Demo is not enabled");
  const onchain = await readFamiliar(label);
  if (!onchain.exists) throw new AppError("NOT_FOUND", "Demo Familiar is not set up");
  const token = await issueSession({ address: onchain.bondedOwner, method: "wallet", demo: true });
  return Response.json(
    { session: { address: onchain.bondedOwner, method: "wallet" }, familiar: await familiarOf(onchain.bondedOwner), demo: label },
    { headers: { "set-cookie": sessionCookie(token) } },
  );
});
