type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { scheduleAfterVisit } from "@/server/familiar/afterVisit";
import { visit } from "@/server/familiar/service";
import { route, saidForm } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/**
 * The nightly visit. multipart/form-data with `audio` (≤60 s voice note) or a `text` field, or a
 * JSON body `{ text }` (1–1000 chars; Whisper is skipped).
 * Paid by the user's iAI credits (0G sign-in) or a prepaid Uniswap feed; 402 PAYMENT_REQUIRED otherwise.
 * Responds once the new portrait + reply exist; ENS + 0G Chain writes follow (poll GET /api/visits/:id).
 */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const session = await requireSession(req);
  await rateLimit(`visit:${session.address}`, 10, 3600);
  const { audio, text } = await saidForm(req, { allowJson: true });
  const result = await visit(session, (await params).name, { audio: audio && { blob: audio, filename: audio.name || "voice.webm" }, text });
  scheduleAfterVisit(session, result);
  return Response.json({ familiar: result.familiar, visit: result.visit, memory: result.memory, reward: result.reward });
});
