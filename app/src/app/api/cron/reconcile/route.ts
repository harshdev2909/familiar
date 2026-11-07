import { and, eq, lt, sql } from "drizzle-orm";
import { agentBalances } from "@/server/chain/clients";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { finalizeChain, pollEvolution } from "@/server/familiar/service";
import { expireTrades } from "@/server/game/trades";
import { failStaleWalks } from "@/server/game/walks";
import { route } from "@/server/http";
import { log } from "@/server/log";
import { sendNeedPushes } from "@/server/push";

export const maxDuration = 300;

/**
 * Every few minutes (vercel.ts crons): retry onchain writes for visits stuck in chain_pending,
 * poll pending evolution clips, fail stuck night walks, expire old trade offers, send "I need you"
 * pushes, and prune expired nonces/quotes. Auth: Bearer CRON_SECRET.
 */
export const GET = route(async (req) => {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new AppError("UNAUTHENTICATED", "cron only");
  const d = await db();
  const stale = new Date(Date.now() - 60_000);
  const pending = await d.query.visits.findMany({
    where: and(eq(schema.visits.status, "chain_pending"), lt(schema.visits.createdAt, stale), lt(schema.visits.chainAttempts, 20)),
    limit: 10,
  });
  const finalized = [];
  for (const v of pending) finalized.push({ id: v.id, status: (await finalizeChain(v.id)).status });
  const clips = await d.query.visits.findMany({ where: eq(schema.visits.videoStatus, "pending"), limit: 5 });
  for (const v of clips) await pollEvolution(v.id).catch(() => undefined);
  const walksFailed = await failStaleWalks();
  await expireTrades();
  const pushes = await sendNeedPushes().catch((e) => {
    log.error("need_pushes_failed", { error: e instanceof Error ? e.message : String(e) });
    return null;
  });
  await d.delete(schema.authNonces).where(lt(schema.authNonces.expiresAt, new Date()));
  await d.delete(schema.feedQuotes).where(lt(schema.feedQuotes.expiresAt, sql`now() - interval '1 day'`));
  const agent = await agentBalances().catch(() => null);
  if (agent?.low) log.error("agent_balance_low", agent);
  return { finalized, clipsPolled: clips.length, walksFailed, pushes, agent };
});
