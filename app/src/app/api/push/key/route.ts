import { route } from "@/server/http";
import { pushPublicKey } from "@/server/push";

/** The VAPID public key for `pushManager.subscribe`, or null when push notifications are off. */
export const GET = route(async () => ({ key: pushPublicKey() }));
