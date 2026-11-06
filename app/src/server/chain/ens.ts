import "server-only";
import { type Address, type Hex, type TransactionReceipt, encodeFunctionData, getAddress, namehash, parseEventLogs, zeroAddress } from "viem";
import { packetToBytes } from "viem/ens";
import { AppError } from "../errors";
import { familiarRegistryAbi, permissionedResolverAbi } from "./abis.generated";
import { EXTERNAL, agent, contracts, operator, publicClient, revertReason, write } from "./clients";

export const PARENT_NAME = "familiar.eth";
export const AGENT_TEXT_KEYS = ["avatar", "mood", "day"] as const;

const universalResolverAbi = [
  {
    type: "function",
    name: "findResolver",
    stateMutability: "view",
    inputs: [{ name: "name", type: "bytes" }],
    outputs: [
      { name: "resolver", type: "address" },
      { name: "node", type: "bytes32" },
      { name: "offset", type: "uint256" },
    ],
  },
] as const;

/** Familiar labels: 3–32 chars of a-z, 0-9 and inner hyphens. A strict subset of ENS-normalized labels. */
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;
const RESERVED = new Set(["admin", "www", "api", "familiar", "root", "eth", "ens"]);

export function normalizeLabel(raw: string): string {
  const label = raw.trim().toLowerCase();
  if (!LABEL_RE.test(label) || label.includes("--")) {
    throw new AppError("BAD_REQUEST", "Name must be 3–32 characters: letters, numbers and single hyphens, not at the ends");
  }
  if (RESERVED.has(label)) throw new AppError("NAME_TAKEN", "That name is reserved");
  return label;
}

export const fullName = (label: string) => `${label}.${PARENT_NAME}`;
export const nodeOf = (label: string) => namehash(fullName(label));
export const dnsEncode = (name: string) => `0x${Buffer.from(packetToBytes(name)).toString("hex")}` as Hex;

export interface OnchainFamiliar {
  bondedOwner: Address;
  generation: number;
  day: number;
  resolver: Address;
  expiresAt: Date;
  dormant: boolean;
  exists: boolean;
}

export async function readFamiliar(label: string): Promise<OnchainFamiliar> {
  const [f, expiry, dormant] = await publicClient("sepolia").readContract({
    address: contracts().registry,
    abi: familiarRegistryAbi,
    functionName: "familiar",
    args: [label],
  });
  return {
    bondedOwner: getAddress(f.bondedOwner),
    generation: Number(f.generation),
    day: Number(f.day),
    resolver: getAddress(f.resolver),
    expiresAt: new Date(Number(expiry) * 1000),
    dormant,
    exists: f.bondedOwner !== zeroAddress,
  };
}

function hatchedFrom(receipt: TransactionReceipt) {
  const [ev] = parseEventLogs({ abi: familiarRegistryAbi, eventName: "Hatched", logs: receipt.logs });
  if (!ev) throw new AppError("UPSTREAM_CHAIN", "Hatched event missing from receipt", { hash: receipt.transactionHash });
  return {
    resolver: getAddress(ev.args.resolver),
    generation: Number(ev.args.generation),
    expiresAt: new Date(Number(ev.args.expiry) * 1000),
    txHash: receipt.transactionHash,
  };
}

/** Register `label.familiar.eth` for `owner` with its own Permissioned Resolver. */
export async function hatchOnchain(label: string, owner: Address) {
  const receipt = await write({
    chain: "sepolia",
    account: operator(),
    address: contracts().registry,
    abi: familiarRegistryAbi,
    functionName: "hatch",
    args: [label, owner],
    label: `hatch(${label})`,
  });
  return hatchedFrom(receipt);
}

/** Re-hatch a dormant Familiar for its bonded owner (fresh resolver, same day counter). */
export async function wakeOnchain(label: string) {
  const receipt = await write({
    chain: "sepolia",
    account: operator(),
    address: contracts().registry,
    abi: familiarRegistryAbi,
    functionName: "wake",
    args: [label],
    label: `wake(${label})`,
  });
  return hatchedFrom(receipt);
}

/** Increment the onchain day counter and roll expiry to now + 7 days. */
export async function recordVisitOnchain(label: string) {
  const receipt = await write({
    chain: "sepolia",
    account: operator(),
    address: contracts().registry,
    abi: familiarRegistryAbi,
    functionName: "recordVisit",
    args: [label],
    label: `recordVisit(${label})`,
  });
  const [ev] = parseEventLogs({ abi: familiarRegistryAbi, eventName: "Visited", logs: receipt.logs });
  if (!ev) throw new AppError("UPSTREAM_CHAIN", "Visited event missing from receipt");
  return { day: Number(ev.args.day), expiresAt: new Date(Number(ev.args.expiry) * 1000), txHash: receipt.transactionHash };
}

export type AgentRecords = Partial<Record<(typeof AGENT_TEXT_KEYS)[number], string>>;

/** Write the agent-scoped text records in one transaction (resolver multicall, sender = agent). */
export async function writeAgentRecords(label: string, resolver: Address, records: AgentRecords) {
  const node = nodeOf(label);
  const calls = Object.entries(records)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [node, key, value!] }));
  if (calls.length === 0) return undefined;
  const receipt = await write({
    chain: "sepolia",
    account: agent(),
    address: resolver,
    abi: permissionedResolverAbi,
    functionName: "multicall",
    args: [calls],
    label: `setText×${calls.length}(${label})`,
  });
  return receipt.transactionHash;
}

export interface LiveEns {
  name: string;
  node: Hex;
  resolver: Address | null;
  resolvedVia: "UniversalResolverV2";
  owner: Address | null;
  expiresAt: string | null;
  dormant: boolean;
  records: Record<string, string>;
  addr: Address | null;
  agent: Address;
  agentKeys: readonly string[];
  explorer: { registry: string; resolver: string | null };
}

/** Resolve through the live ENSv2 UniversalResolver and read the Familiar's records. */
export async function resolveLive(label: string): Promise<LiveEns> {
  const pc = publicClient("sepolia");
  const name = fullName(label);
  const node = nodeOf(label);
  const [[resolverRaw], onchain] = await Promise.all([
    pc.readContract({ address: EXTERNAL.universalResolverV2, abi: universalResolverAbi, functionName: "findResolver", args: [dnsEncode(name)] }),
    readFamiliar(label),
  ]);
  const resolver = resolverRaw === zeroAddress ? null : getAddress(resolverRaw);
  const records: Record<string, string> = {};
  let addr: Address | null = null;
  if (resolver) {
    const keys = [...AGENT_TEXT_KEYS];
    const [texts, a] = await Promise.all([
      Promise.all(keys.map((k) => pc.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "text", args: [node, k] }))),
      pc.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "addr", args: [node] }),
    ]);
    keys.forEach((k, i) => texts[i] && (records[k] = texts[i]!));
    addr = a === zeroAddress ? null : getAddress(a);
  }
  return {
    name,
    node,
    resolver,
    resolvedVia: "UniversalResolverV2",
    owner: onchain.exists && !onchain.dormant ? onchain.bondedOwner : null,
    expiresAt: onchain.exists ? onchain.expiresAt.toISOString() : null,
    dormant: onchain.dormant,
    records,
    addr,
    agent: agent().address,
    agentKeys: AGENT_TEXT_KEYS,
    explorer: {
      registry: `https://sepolia.etherscan.io/address/${contracts().registry}`,
      resolver: resolver ? `https://sepolia.etherscan.io/address/${resolver}` : null,
    },
  };
}

/**
 * Live Enhanced Access Control demo: simulate the agent calling `setAddr` (and an unscoped text key)
 * on the Familiar's resolver. Nothing is sent; the node returns the real revert.
 */
export async function simulateAgentOverreach(label: string) {
  const { resolver, dormant } = await readFamiliar(label);
  if (dormant) throw new AppError("DORMANT", "This Familiar is asleep; its name does not resolve");
  const pc = publicClient("sepolia");
  const node = nodeOf(label);
  const attempt = async (functionName: "setAddr" | "setText", args: readonly unknown[]) => {
    try {
      await pc.simulateContract({ account: agent().address, address: resolver, abi: permissionedResolverAbi, functionName, args } as never);
      return { reverted: false as const };
    } catch (e) {
      return { reverted: true as const, error: revertReason(e) ?? "reverted" };
    }
  };
  const [setAddr, setUrl, setMood] = await Promise.all([
    attempt("setAddr", [node, agent().address]),
    attempt("setText", [node, "url", "https://example.com"]),
    attempt("setText", [node, "mood", "curious"]),
  ]);
  return {
    resolver,
    agent: agent().address,
    attempts: [
      { call: `setAddr(${fullName(label)}, agent)`, ...setAddr },
      { call: `setText(${fullName(label)}, "url", …)`, ...setUrl },
      { call: `setText(${fullName(label)}, "mood", …)`, ...setMood },
    ],
  };
}
