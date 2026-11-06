type P<T> = { params: Promise<T> };
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getVisit, pollEvolution } from "@/server/familiar/service";
import { route } from "@/server/http";
import { log } from "@/server/log";

const Id = z.uuid();

/** Poll a visit: chain status (renew / ENS records / 0G day log) and the evolution clip. */
export const GET = route<P<{ id: string }>>(async (req, { params }) => {
  const session = await requireSession(req);
  const id = Id.parse((await params).id);
  const first = await getVisit(id, session.address);
  if (first.visit.video.status === "pending") {
    await pollEvolution(id).catch((e) => log.warn("evolution_poll", { id, error: e instanceof Error ? e.message : String(e) }));
    return getVisit(id, session.address);
  }
  return first;
});
