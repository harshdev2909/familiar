import { requireSession } from "@/server/auth/session";
import { scheduleAfterVisit } from "@/server/familiar/afterVisit";
import { hatch } from "@/server/familiar/service";
import { audioForm, clientIp, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const maxDuration = 300;

/**
 * multipart/form-data: `name`, `audio` (the "three things you care about" voice note),
 * optional `species`, `color`. Registers <name>.familiar.eth and runs the first visit.
 */
export const POST = route(async (req) => {
  const session = await requireSession(req);
  await rateLimit(`hatch:${session.address}`, 3, 3600);
  await rateLimit(`hatch-ip:${clientIp(req)}`, 10, 3600);
  const { audio, fields } = await audioForm(req);
  const result = await hatch(session, {
    name: fields.name ?? "",
    species: fields.species || undefined,
    color: fields.color || undefined,
    audio: { blob: audio, filename: audio.name || "voice.webm" },
  });
  scheduleAfterVisit(session, result);
  return Response.json({ familiar: result.familiar, visit: result.visit, memory: result.memory, hatchTx: result.hatchTx }, { status: 201 });
});
