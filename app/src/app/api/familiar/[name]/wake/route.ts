type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { scheduleAfterVisit } from "@/server/familiar/afterVisit";
import { wake } from "@/server/familiar/service";
import { audioForm, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/** Wake a dormant Familiar (costs one visit). Optional multipart `audio`; empty body is fine. */
export const POST = route<P<{ name: string }>>(async (req, { params }) => {
  const session = await requireSession(req);
  await rateLimit(`wake:${session.address}`, 5, 3600);
  const ct = req.headers.get("content-type") ?? "";
  const audio = ct.startsWith("multipart/form-data") ? (await audioForm(req)).audio : undefined;
  const result = await wake(session, (await params).name, audio && { blob: audio, filename: audio.name || "voice.webm" });
  scheduleAfterVisit(session, result);
  return Response.json({ familiar: result.familiar, visit: result.visit, memory: result.memory });
});
