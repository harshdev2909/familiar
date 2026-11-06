type P<T> = { params: Promise<T> };
import { AppError } from "@/server/errors";
import { env } from "@/server/env";
import { route } from "@/server/http";
import { readLocalMedia } from "@/server/media";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp4: "video/mp4" };

/** Local media for development (production serves media from Vercel Blob). */
export const GET = route<P<{ key: string[] }>>(async (_req, { params }) => {
  if (env().BLOB_READ_WRITE_TOKEN) throw new AppError("NOT_FOUND", "Not found");
  const key = (await params).key.join("/");
  const bytes = await readLocalMedia(key);
  if (!bytes) throw new AppError("NOT_FOUND", "Not found");
  const ext = key.split(".").pop() ?? "";
  return new Response(Buffer.from(bytes), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" } });
});
