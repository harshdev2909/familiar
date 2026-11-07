type P<T> = { params: Promise<T> };
import { requireSession } from "@/server/auth/session";
import { meetCodeFor } from "@/server/game/social";
import { route } from "@/server/http";

/** Owner only: today's QR code for meeting in person `{ code, url, expiresAt }` (rotates at 00:00 UTC). */
export const GET = route<P<{ name: string }>>(async (req, { params }) => meetCodeFor(await requireSession(req), (await params).name));
