import "server-only";
import { z } from "zod";
import { AppError, isAppError } from "./errors";
import { log } from "./log";

export type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler: assigns a request id, converts AppError/ZodError into the standard
 * `{ error: { code, message, details? } }` envelope, and logs unexpected failures without leaking
 * internals to the client.
 */
export function route<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response | unknown>): Handler<C> {
  return async (req, ctx) => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const started = performance.now();
    let res: Response;
    try {
      const out = await fn(req, ctx);
      res = out instanceof Response ? out : Response.json(out);
    } catch (e) {
      res = errorResponse(e, requestId, req);
    }
    res.headers.set("x-request-id", requestId);
    if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
    log.info("http", {
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
      ms: Math.round(performance.now() - started),
    });
    return res;
  };
}

function errorResponse(e: unknown, requestId: string, req: Request): Response {
  if (e instanceof z.ZodError) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Invalid request", details: z.flattenError(e) } },
      { status: 400 },
    );
  }
  if (isAppError(e)) {
    if (e.status >= 500) log.error("app_error", { requestId, code: e.code, message: e.message, cause: describe(e.cause) });
    return Response.json(
      { error: { code: e.code, message: e.message, ...(e.details !== undefined && { details: e.details }) } },
      { status: e.status },
    );
  }
  log.error("unhandled", { requestId, path: new URL(req.url).pathname, error: describe(e) });
  return Response.json({ error: { code: "INTERNAL", message: "Internal error", requestId } }, { status: 500 });
}

const describe = (e: unknown) => (e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e);

/** Parse a JSON body against a schema. */
export async function json<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Body must be valid JSON");
  }
  return schema.parse(body);
}

/** Parse query parameters against a schema. */
export function query<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // Vercel request bodies cap at 4.5 MB
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/m4a", "audio/x-m4a"]);

/** Read a multipart form with an `audio` file plus string fields. */
export async function audioForm(req: Request): Promise<{ audio: File; fields: Record<string, string> }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_AUDIO_BYTES + 64 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", "Voice note is too large (max 4 MB)");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("BAD_REQUEST", "Expected multipart/form-data");
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) throw new AppError("BAD_REQUEST", "Missing `audio` file field");
  if (audio.size === 0) throw new AppError("BAD_REQUEST", "Voice note is empty");
  if (audio.size > MAX_AUDIO_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Voice note is too large (max 4 MB)");
  const base = audio.type.split(";")[0]!.trim();
  if (!AUDIO_TYPES.has(base)) throw new AppError("UNSUPPORTED_MEDIA", `Unsupported audio type: ${audio.type || "unknown"}`);
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  return { audio, fields };
}

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
