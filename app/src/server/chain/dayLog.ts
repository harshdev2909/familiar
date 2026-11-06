import "server-only";
import { type Hex, keccak256, stringToHex } from "viem";
import { familiarLogAbi } from "./abis.generated";
import { agent, contracts, publicClient, write } from "./clients";

/** keccak256 of the day's 0G request IDs joined with "," — anyone can recompute it from the receipts drawer. */
export const requestIdsHash = (ids: string[]) => keccak256(stringToHex(ids.join(",")));

export async function lastLoggedDay(node: Hex): Promise<number> {
  const d = await publicClient("zg").readContract({ address: contracts().log, abi: familiarLogAbi, functionName: "lastDay", args: [node] });
  return Number(d);
}

/** Append the day to FamiliarLog on 0G Chain. Idempotent: returns undefined if the day is already logged. */
export async function logDayOnchain(args: { node: Hex; day: number; reqHash: Hex; imageHash: Hex; memoryRoot: Hex }) {
  if ((await lastLoggedDay(args.node)) >= args.day) return undefined;
  const receipt = await write({
    chain: "zg",
    account: agent(),
    address: contracts().log,
    abi: familiarLogAbi,
    functionName: "logDay",
    args: [args.node, args.day, args.reqHash, args.imageHash, args.memoryRoot],
    label: `logDay(day ${args.day})`,
  });
  return receipt.transactionHash;
}
