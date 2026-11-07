import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { json, route } from "@/server/http";
import { subscribe, unsubscribe } from "@/server/push";
import { rateLimit } from "@/server/rateLimit";

const Endpoint = z.url({ protocol: /^https$/ }).max(2048);
const Sub = z.object({
  endpoint: Endpoint,
  keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(128) }),
});

/** Save this browser's push subscription (`PushSubscription.toJSON()`). */
export const POST = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`push-sub:${s.address}`, 20, 3600);
  return subscribe(s, await json(req, Sub));
});

/** Forget a subscription `{ endpoint }` (idempotent). */
export const DELETE = route(async (req) => {
  const s = await requireSession(req);
  await rateLimit(`push-unsub:${s.address}`, 30, 3600);
  const { endpoint } = await json(req, z.object({ endpoint: z.string().min(1).max(2048) }));
  return unsubscribe(s, endpoint);
});
