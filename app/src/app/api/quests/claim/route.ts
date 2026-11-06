import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { claimQuest } from "@/server/game/service";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ questId: z.string().min(1).max(40) });

/** Claim a finished quest's Sparks (once per period). */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`claim:${s.address}`, 30, 60);
  const { questId } = await json(req, Body);
  return claimQuest(s, questId);
});
