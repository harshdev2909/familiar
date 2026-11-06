type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { scheduleAfterVisit } from "@/server/familiar/afterVisit";
import { visit } from "@/server/familiar/service";
import { audioForm, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/**
 * The nightly visit. multipart/form-data with `audio` (≤60 s voice note).
 * Paid by the user's iAI credits (0G sign-in) or a prepaid Uniswap feed; 402 PAYMENT_REQUIRED otherwise.
 * Responds once the new portrait + reply exist; ENS + 0G Chain writes follow (poll GET /api/visits/:id).
 */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const session = await requireSession(req);
  await rateLimit(`visit:${session.address}`, 10, 3600);
  const { audio } = await audioForm(req);
  const result = await visit(session, (await params).name, { blob: audio, filename: audio.name || "voice.webm" });
  scheduleAfterVisit(session, result);
  return Response.json({ familiar: result.familiar, visit: result.visit, memory: result.memory });
});
