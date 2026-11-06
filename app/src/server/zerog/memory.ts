import "server-only";
import { type Hex, keccak256, toHex } from "viem";
import { env } from "../env";
import { AppError } from "../errors";
import { log } from "../log";

/**
 * Memory is the only thing that persists about what a human said: a ≤120-word summary written by
 * 0GM-1.0 (no verbatim quotes). It is encrypted with AES-256-GCM under a per-Familiar key derived
 * via HKDF-SHA256 from MEMORY_MASTER_KEY, and the ciphertext alone goes to the DB and 0G Storage.
 * Format: `v1.<iv b64url>.<ciphertext+tag b64url>`.
 */
const INFO = new TextEncoder().encode("familiar-memory-v1");

async function keyFor(node: Hex) {
  const master = await crypto.subtle.importKey("raw", Buffer.from(env().MEMORY_MASTER_KEY.slice(2), "hex"), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: Buffer.from(node.slice(2), "hex"), info: INFO },
    master,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMemory(node: Hex, summary: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: Buffer.from(node.slice(2), "hex") }, await keyFor(node), new TextEncoder().encode(summary));
  return `v1.${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
}

export async function decryptMemory(node: Hex, sealed: string | null | undefined): Promise<string> {
  if (!sealed) return "";
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new AppError("INTERNAL", "Unrecognized memory format");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64url"), additionalData: Buffer.from(node.slice(2), "hex") },
    await keyFor(node),
    Buffer.from(ct, "base64url"),
  );
  return new TextDecoder().decode(pt);
}

/**
 * Upload the ciphertext to 0G Storage and return its Merkle root. When 0G Storage is disabled,
 * returns keccak256(ciphertext) as the commitment instead (still verifiable against the DB copy).
 */
export async function persistMemory(sealed: string): Promise<{ root: Hex; onZeroGStorage: boolean }> {
  const bytes = new TextEncoder().encode(sealed);
  if (!env().ZG_STORAGE_ENABLED) return { root: keccak256(bytes), onZeroGStorage: false };
  const [{ Indexer, MemData }, { ethers }] = await Promise.all([import("@0gfoundation/0g-storage-ts-sdk"), import("ethers")]);
  const signer = new ethers.Wallet(env().AGENT_PRIVATE_KEY, new ethers.JsonRpcProvider(env().ZG_RPC));
  const mem = new MemData(bytes);
  const [, treeErr] = await mem.merkleTree();
  if (treeErr) throw new AppError("UPSTREAM_ZEROG", `0G Storage merkle tree failed: ${String(treeErr)}`);
  const [tx, err] = await new Indexer(env().ZG_STORAGE_INDEXER).upload(mem, env().ZG_RPC, signer as never);
  if (err || !tx) throw new AppError("UPSTREAM_ZEROG", `0G Storage upload failed: ${String(err)}`);
  const root = ("rootHash" in tx ? tx.rootHash : tx.rootHashes[0]) as Hex;
  log.info("zg_storage_upload", { root, bytes: bytes.length });
  return { root, onZeroGStorage: true };
}

export const toBytes32 = (h: Hex): Hex => (h.length === 66 ? h : toHex(BigInt(h), { size: 32 }));
