type P<T> = { params: Promise<T> };
import { getSession } from "@/server/auth/session";
import { getWalk } from "@/server/game/walks";
import { route } from "@/server/http";

/** Public walk state (poll while `painting`). `canJoin`/`canStart`/`joined` reflect the signed-in viewer. */
export const GET = route<P<{ id: string }>>(async (req, { params }) => getWalk((await params).id, await getSession(req)));
