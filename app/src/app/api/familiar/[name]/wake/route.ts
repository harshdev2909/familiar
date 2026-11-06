type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { scheduleAfterVisit } from "@/server/familiar/afterVisit";
import { wake } from "@/server/familiar/service";
import { route, saidForm } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/** Wake a dormant Familiar (costs one visit). Optional multipart `audio` or `text` (or JSON `{ text }`); empty body is fine. */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const session = await requireSession(req);
  await rateLimit(`wake:${session.address}`, 5, 3600);
  const { audio, text } = await saidForm(req, { allowJson: true });
  const result = await wake(session, (await params).name, { audio: audio && { blob: audio, filename: audio.name || "voice.webm" }, text });
  scheduleAfterVisit(session, result);
  return Response.json({ familiar: result.familiar, visit: result.visit, memory: result.memory, reward: result.reward });
});
