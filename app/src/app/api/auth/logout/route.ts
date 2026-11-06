import { clearSessionCookie } from "@/server/auth/session";
import { route } from "@/server/http";

export const POST = route(async () => Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } }));
