type P<T> = { params: Promise<T> };
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { meet } from "@/server/game/social";
import { json, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const Body = z.object({ code: z.string().trim().min(1).max(64) });

/**
 * Meet this Familiar in person with the code from its QR: 3× the spot reward (15 Sparks + 15 XP,
 * +30 for a new species), once per pair — also upgrades an earlier remote spot.
 * 400 INVALID_CODE for a wrong/expired code, 409 ALREADY_MET.
 */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const s = await requireSession(req);
  await rateLimit(`meet:${s.address}`, 20, 60);
  const { code } = await json(req, Body);
  return meet(s, (await params).name, code);
});
