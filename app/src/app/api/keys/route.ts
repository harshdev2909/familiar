import { z } from "zod";
import { createKey, listKeys } from "@/server/auth/apiKeys";
import { requireSession } from "@/server/auth/session";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Your live connector keys (the key itself is never shown again). */
export const GET = route(async (req) => listKeys(await requireSession(req)));

const Body = z.object({ label: z.string().trim().min(1).max(40) });

/** Create a personal key for ChatGPT / Claude (max 5 live). Returns the key once, plus the connector URL. */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`keys:${s.address}`, 10, 3600);
  const { label } = await json(req, Body);
  return createKey(s, label);
});
