import { requireSession } from "@/server/auth/session";
import { dex } from "@/server/game/social";
import { route } from "@/server/http";

/** Your Dex: every species (caught once you've spotted one) and every Familiar you've spotted. */
export const GET = route(async (req) => dex(await requireSession(req)));
