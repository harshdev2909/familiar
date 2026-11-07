import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { type Address, getAddress } from "viem";
import { env } from "../env";
import { AppError } from "../errors";
import { KEY_PREFIX, sessionFromKey } from "./apiKeys";

export const SESSION_COOKIE = "familiar_session";
const SESSION_TTL_S = 7 * 24 * 3600;

export interface Session {
  address: Address;
  /** How the user signed in. `iai` sessions spend the user's own 0G credits. */
  method: "wallet" | "iai";
  privyUserId?: string;
  /** User-scoped 0G credential for iAI sessions (encrypted inside the JWT, never sent to the browser in clear). */
  zgUserToken?: string;
  /** Signature-less "try the demo" session: may visit and play, never manage keys, data, pushes or trades. */
  demo?: boolean;
  /** Set when the request authenticated with a personal `fam_` key (connectors) instead of the cookie. */
  apiKeyId?: string;
}

const key = () => new TextEncoder().encode(env().SESSION_SECRET);

export async function issueSession(s: Session): Promise<string> {
  return new SignJWT({ m: s.method, p: s.privyUserId, z: s.zgUserToken ? await seal(s.zgUserToken) : undefined, d: s.demo ? 1 : undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.address)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .setIssuer("familiar")
    .sign(key());
}

export function sessionCookie(token: string) {
  const secure = env().APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_S}${secure}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

function readToken(req: Request): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m?.[1];
}

/**
 * The caller's session: a signed session JWT (cookie or `Authorization: Bearer <jwt>`) or a
 * personal key (`Authorization: Bearer fam_…`). Unknown, revoked or invalid credentials → null.
 */
export async function getSession(req: Request): Promise<Session | null> {
  const token = readToken(req);
  if (!token) return null;
  if (token.startsWith(KEY_PREFIX)) return sessionFromKey(token);
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "familiar", algorithms: ["HS256"] });
    return {
      address: getAddress(payload.sub!),
      method: payload.m === "iai" ? "iai" : "wallet",
      privyUserId: typeof payload.p === "string" ? payload.p : undefined,
      zgUserToken: typeof payload.z === "string" ? await unseal(payload.z) : undefined,
      demo: payload.d === 1 ? true : undefined,
    };
  } catch {
    return null;
  }
}

/** Demo sessions are shared by every visitor, so anything destructive or persistent is off-limits. */
export function forbidDemo(s: Session, what: string) {
  if (s.demo) throw new AppError("FORBIDDEN", `The demo can't ${what} — sign in with your own wallet`);
}

export async function requireSession(req: Request): Promise<Session> {
  const s = await getSession(req);
  if (!s) throw new AppError("UNAUTHENTICATED", "Sign in first");
  return s;
}

// AES-GCM sealing for credentials carried inside the session JWT.
async function aesKey() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`session-seal:${env().SESSION_SECRET}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain)));
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
}

async function unseal(sealed: string): Promise<string | undefined> {
  const [iv, ct] = sealed.split(".");
  if (!iv || !ct) return undefined;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64url") }, await aesKey(), Buffer.from(ct, "base64url"));
    return new TextDecoder().decode(pt);
  } catch {
    return undefined;
  }
}
