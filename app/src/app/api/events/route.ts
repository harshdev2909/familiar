import { eventViews } from "@/server/game/events";
import { route } from "@/server/http";

/** Event spotlights: live → upcoming → recently ended (14 days). */
export const GET = route(async () => ({ events: eventViews() }));
