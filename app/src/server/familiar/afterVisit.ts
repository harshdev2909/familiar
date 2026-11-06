import "server-only";
import { after } from "next/server";
import type { Session } from "../auth/session";
import { log } from "../log";
import { ZeroGRouter } from "../zerog/router";
import { finalizeChain, startEvolution } from "./service";

/** After the response: write ENS records + renew + day log, and kick off the 7th-day clip. */
export function scheduleAfterVisit(session: Session, result: { visit: { id: string }; evolve: null | { visitId: string; portraitUrl: string; prompt: string; iai: boolean } }) {
  after(async () => {
    try {
      await finalizeChain(result.visit.id);
    } catch (e) {
      log.error("after_finalize", { visitId: result.visit.id, error: e instanceof Error ? e.message : String(e) });
    }
    if (result.evolve) {
      const router = result.evolve.iai && session.zgUserToken ? new ZeroGRouter({ token: session.zgUserToken, clientRequestId: result.visit.id }) : ZeroGRouter.team(result.visit.id);
      await startEvolution(result.evolve, router);
    }
  });
}
