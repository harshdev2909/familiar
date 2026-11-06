import { requireSession } from "@/server/auth/session";
import { quests } from "@/server/game/service";
import { route } from "@/server/http";

/** Daily, weekly and festival quests with progress, plus badges. */
export const GET = route(async (req) => quests(await requireSession(req)));
