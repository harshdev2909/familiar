import { getSession } from "@/server/auth/session";
import { explore } from "@/server/game/social";
import { route } from "@/server/http";

/** The map: up to 40 awake Familiars, most recently visited first (`spotted`/`mine` need a session). */
export const GET = route(async (req) => explore(await getSession(req)));
