import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { del, put } from "@vercel/blob";
import { type Hex, keccak256 } from "viem";
import { env } from "./env";
import { AppError } from "./errors";
import { log } from "./log";

const localRoot = () => normalize(env().MEDIA_DIR ?? join(process.cwd(), ".data/media"));

export interface StoredMedia {
  url: string;
  hash: Hex;
}

/**
 * Public, immutable media (portraits, clips). Vercel Blob when BLOB_READ_WRITE_TOKEN is set;
 * otherwise local disk served by /api/media (development and tests only).
 */
/** Fail fast (before any onchain write or paid inference) when media storage is unusable. */
export function assertMediaConfigured() {
  if (!env().BLOB_READ_WRITE_TOKEN && env().NODE_ENV === "production" && !env().ALLOW_LOCAL_MEDIA) {
    throw new AppError("NOT_CONFIGURED", "BLOB_READ_WRITE_TOKEN is required in production");
  }
}

export async function storeMedia(key: string, bytes: Uint8Array, contentType: string): Promise<StoredMedia> {
  const hash = keccak256(bytes);
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (token) {
    const blob = await put(key, Buffer.from(bytes), { access: "public", contentType, token, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31_536_000 });
    return { url: blob.url, hash };
  }
  assertMediaConfigured();
  const path = safePath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return { url: `${env().APP_URL}/api/media/${key}`, hash };
}

export async function readLocalMedia(key: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(safePath(key)));
  } catch {
    return null;
  }
}

const LOCAL_PREFIX = () => `${env().APP_URL}/api/media/`;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

/** Load stored media back as bytes (local disk or a public Blob URL). Returns null if unavailable. */
export async function loadMedia(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    if (url.startsWith(LOCAL_PREFIX())) {
      const bytes = await readLocalMedia(url.slice(LOCAL_PREFIX().length));
      return bytes ? { bytes, contentType: imageType(bytes).contentType } : null;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_REFERENCE_BYTES) return null;
    return { bytes, contentType: res.headers.get("content-type") ?? imageType(bytes).contentType };
  } catch (e) {
    log.warn("media_load_failed", { url, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Best-effort deletion of stored media by URL. */
export async function deleteMedia(urls: string[]) {
  const token = env().BLOB_READ_WRITE_TOKEN;
  const remote = urls.filter((u) => !u.startsWith(LOCAL_PREFIX()));
  const local = urls.filter((u) => u.startsWith(LOCAL_PREFIX()));
  await Promise.all([
    remote.length && token ? del(remote, { token }).catch((e) => log.warn("media_delete_failed", { error: String(e) })) : undefined,
    ...local.map((u) => rm(safePath(u.slice(LOCAL_PREFIX().length)), { force: true }).catch(() => undefined)),
  ]);
}

function safePath(key: string) {
  const p = normalize(join(localRoot(), key));
  if (!p.startsWith(localRoot()) || !/^[a-z0-9/_.-]+$/i.test(key)) throw new AppError("BAD_REQUEST", "Invalid media key");
  return p;
}

/** Sniff PNG/JPEG/WEBP for the content type of generated images. */
export function imageType(bytes: Uint8Array): { contentType: string; ext: string } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { contentType: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { contentType: "image/jpeg", ext: "jpg" };
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return { contentType: "image/webp", ext: "webp" };
  return { contentType: "application/octet-stream", ext: "bin" };
}
