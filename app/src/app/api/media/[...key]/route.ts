type P<T> = { params: Promise<T> };
import { AppError } from "@/server/errors";
import { env } from "@/server/env";
import { route } from "@/server/http";
import { readLocalMedia } from "@/server/media";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

/**
 * Media stored on local disk / a mounted volume (when Blob storage isn't configured).
 * Public and immutable: CORS-open so WebGL can use portraits as textures from any of our origins,
 * and byte ranges are honoured so Safari can play voice replies and evolution clips.
 */
export const GET = route<P<{ key: string[] }>>(async (req, { params }) => {
  if (env().BLOB_READ_WRITE_TOKEN) throw new AppError("NOT_FOUND", "Not found");
  const key = (await params).key.join("/");
  const bytes = await readLocalMedia(key);
  if (!bytes) throw new AppError("NOT_FOUND", "Not found");
  const ext = (key.split(".").pop() ?? "").toLowerCase();
  const headers: Record<string, string> = {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
    "accept-ranges": "bytes",
    // Audio/video must reach this handler for byte ranges (Safari): keep them out of the proxy CDN's cache,
    // which would answer ranges with the full 200 body. Browsers still cache them via cache-control.
    ...(ext === "mp3" || ext === "mp4" ? { "vercel-cdn-cache-control": "no-store", "cdn-cache-control": "no-store" } : {}),
  };
  const total = bytes.byteLength;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${total}` } });
    }
    return new Response(Buffer.from(bytes.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(Buffer.from(bytes), { headers: { ...headers, "content-length": String(total) } });
});
