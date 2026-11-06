import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { put } from "@vercel/blob";
import { type Hex, keccak256 } from "viem";
import { env } from "./env";
import { AppError } from "./errors";

const LOCAL_ROOT = join(process.cwd(), ".data/media");

export interface StoredMedia {
  url: string;
  hash: Hex;
}

/**
 * Public, immutable media (portraits, clips). Vercel Blob when BLOB_READ_WRITE_TOKEN is set;
 * otherwise local disk served by /api/media (development and tests only).
 */
export async function storeMedia(key: string, bytes: Uint8Array, contentType: string): Promise<StoredMedia> {
  const hash = keccak256(bytes);
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (token) {
    const blob = await put(key, Buffer.from(bytes), { access: "public", contentType, token, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31_536_000 });
    return { url: blob.url, hash };
  }
  if (env().NODE_ENV === "production") throw new AppError("NOT_CONFIGURED", "BLOB_READ_WRITE_TOKEN is required in production");
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

function safePath(key: string) {
  const p = normalize(join(LOCAL_ROOT, key));
  if (!p.startsWith(LOCAL_ROOT) || !/^[a-z0-9/_.-]+$/i.test(key)) throw new AppError("BAD_REQUEST", "Invalid media key");
  return p;
}

/** Sniff PNG/JPEG/WEBP for the content type of generated images. */
export function imageType(bytes: Uint8Array): { contentType: string; ext: string } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { contentType: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { contentType: "image/jpeg", ext: "jpg" };
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return { contentType: "image/webp", ext: "webp" };
  return { contentType: "application/octet-stream", ext: "bin" };
}
