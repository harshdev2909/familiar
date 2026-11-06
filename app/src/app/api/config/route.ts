import { demoLabels, env } from "@/server/env";
import { route } from "@/server/http";

/** Public client config: which optional experiences are available. */
export const GET = route(async () => {
  const e = env();
  const demo = e.DEMO_LOGIN_ENABLED ? ([...demoLabels()][0] ?? null) : null;
  return Response.json({ demo, zeroG: Boolean(e.PRIVY_APP_ID) }, { headers: { "cache-control": "public, max-age=60" } });
});
