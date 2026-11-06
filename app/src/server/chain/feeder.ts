import "server-only";
import { type Address, type Hex, encodeFunctionData, erc20Abi, getAddress, isAddressEqual, parseEventLogs } from "viem";
import { AppError } from "../errors";
import { familiarFeederAbi } from "./abis.generated";
import { EXTERNAL, contracts, publicClient } from "./clients";

/** Confirmations required on Base before a feed unlocks a visit. */
export const FEED_CONFIRMATIONS = 2n;

export interface VerifiedFeed {
  txHash: Hex;
  logIndex: number;
  feeder: Address;
  familiarNode: Hex;
  amount: bigint;
  visits: number;
  blockNumber: bigint;
}

export async function pricePerVisit(): Promise<bigint> {
  return publicClient("base").readContract({ address: contracts().feeder, abi: familiarFeederAbi, functionName: "pricePerVisit" });
}

/**
 * Fetch a Base transaction receipt and return every `Fed` event emitted by OUR FamiliarFeeder.
 * Events from any other contract (spoofed `Fed` logs) are ignored.
 */
export async function verifyFeedTx(txHash: Hex): Promise<{ status: "pending" } | { status: "confirmed"; feeds: VerifiedFeed[] }> {
  const pc = publicClient("base");
  const receipt = await pc.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) return { status: "pending" };
  if (receipt.status !== "success") throw new AppError("BAD_REQUEST", "That transaction reverted on Base", { txHash });
  const head = await pc.getBlockNumber();
  if (head - receipt.blockNumber + 1n < FEED_CONFIRMATIONS) return { status: "pending" };

  const feeder = contracts().feeder;
  const logs = receipt.logs.filter((l) => isAddressEqual(l.address, feeder));
  const feeds = parseEventLogs({ abi: familiarFeederAbi, eventName: "Fed", logs }).map((ev) => ({
    txHash,
    logIndex: ev.logIndex,
    feeder: getAddress(ev.args.feeder),
    familiarNode: ev.args.familiarNode,
    amount: ev.args.amount,
    visits: Number(ev.args.visits),
    blockNumber: receipt.blockNumber,
  }));
  if (feeds.length === 0) throw new AppError("BAD_REQUEST", "No Fed event from FamiliarFeeder in that transaction", { txHash });
  return { status: "confirmed", feeds };
}

/** The two calls appended after Uniswap's swap calls in the EIP-5792 batch. */
export function feedCalls(node: Hex, amount: bigint) {
  const feeder = contracts().feeder;
  return [
    {
      to: EXTERNAL.base.w0g,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [feeder, amount] }),
      value: "0x0" as Hex,
    },
    {
      to: feeder,
      data: encodeFunctionData({ abi: familiarFeederAbi, functionName: "feed", args: [node, amount] }),
      value: "0x0" as Hex,
    },
  ];
}
