import { getSession } from "@/server/auth/session";
import { shop } from "@/server/game/service";
import { route } from "@/server/http";

/** The accessory shop, with what the signed-in Familiar owns and wears. */
export const GET = route(async (req) => shop(await getSession(req)));
