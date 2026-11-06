type P<T> = { params: Promise<T> };
import { z } from "zod";
import { revokeKey } from "@/server/auth/apiKeys";
import { requireSession } from "@/server/auth/session";
import { route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

/** Revoke a connector key: it stops working immediately. */
export const DELETE = route<P<{ id: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`keys-revoke:${s.address}`, 30, 3600);
  return revokeKey(s, z.uuid().parse((await params).id));
});
