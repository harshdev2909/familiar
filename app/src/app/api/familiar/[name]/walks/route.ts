type P<T> = { params: Promise<T> };
import { getSession } from "@/server/auth/session";
import { familiarWalks } from "@/server/game/walks";
import { route } from "@/server/http";

/** Public: the latest 12 finished night walks this Familiar was in. */
export const GET = route<P<{ name: string }>>(async (req, { params }) => familiarWalks((await params).name, await getSession(req)));
