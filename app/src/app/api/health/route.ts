import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { publicClient, contracts } from "@/server/chain/clients";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { route } from "@/server/http";

/** Liveness + configuration report. Never returns secrets. */
export const GET = route(async () => {
  await connection();
  const e = env();
  const check = async (fn: () => Promise<unknown>) => {
    const t = performance.now();
    try {
      await fn();
      return { ok: true, ms: Math.round(performance.now() - t) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "error" };
    }
  };
  const [database, sepolia, base, zg] = await Promise.all([
    check(async () => (await db()).execute(sql`select 1`)),
    check(() => publicClient("sepolia").getBlockNumber()),
    check(() => publicClient("base").getBlockNumber()),
    check(() => publicClient("zg").getBlockNumber()),
  ]);
  const ok = database.ok && sepolia.ok && base.ok && zg.ok;
  return Response.json(
    {
      ok,
      checks: { database, sepolia, base, zg },
      configured: {
        zerogApiKey: Boolean(e.ZG_API_KEY),
        uniswapApiKey: Boolean(e.UNISWAP_API_KEY),
        privyAppId: Boolean(e.PRIVY_APP_ID),
        blobStorage: Boolean(e.BLOB_READ_WRITE_TOKEN),
        zerogStorage: e.ZG_STORAGE_ENABLED,
        cronSecret: Boolean(e.CRON_SECRET),
      },
      contracts: contracts(),
      models: { stt: e.ZG_MODEL_STT, chat: e.ZG_MODEL_CHAT, image: e.ZG_MODEL_IMAGE, video: e.ZG_MODEL_VIDEO },
    },
    { status: ok ? 200 : 503 },
  );
});
