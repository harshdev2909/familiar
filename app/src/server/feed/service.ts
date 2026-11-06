import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { type Address, type Hex, formatUnits, getAddress, numberToHex } from "viem";
import { EXTERNAL } from "../chain/clients";
import { feedCalls, pricePerVisit, verifyFeedTx } from "../chain/feeder";
import { db, schema } from "../db/client";
import { env } from "../env";
import { AppError } from "../errors";
import { log } from "../log";
import { feedCredits, getFamiliarRow } from "../familiar/service";
import { normalizeLabel } from "../chain/ens";
import { type ClassicQuote, type Permit, type QuoteResponse, type TransactionRequest, UniswapClient, assertUsableQuote, minimumOut } from "../uniswap/client";

const QUOTE_TTL_MS = 30_000; // Uniswap: re-quote after ~30 s
export const MAX_FEED_USD = 25;

interface StoredQuote {
  response: QuoteResponse;
  slippagePct: number;
}

export interface FeedQuoteView {
  quoteId: string;
  label: string;
  swapper: Address;
  amountInUsdc: string;
  amountInRaw: string;
  expectedW0g: string;
  minimumW0g: string;
  /** W0G actually fed (= the guaranteed minimum); any surplus stays in the wallet. */
  feedAmountRaw: string;
  visits: number;
  pricePerVisitW0g: string;
  priceImpactPct: number | null;
  gasFeeUsd: string | null;
  route: string | null;
  uniswapRequestId: string;
  expiresAt: string;
}

/** Step 1: quote $X of USDC → W0G on Base for the signed-in wallet, sized to whole visits. */
export async function quoteFeed(args: { label: string; swapper: Address; usd: number }, uni = new UniswapClient()): Promise<FeedQuoteView> {
  const label = normalizeLabel(args.label);
  const f = await getFamiliarRow(label);
  if (!f) throw new AppError("NOT_FOUND", "No Familiar with that name");
  if (!(args.usd >= 1 && args.usd <= MAX_FEED_USD)) throw new AppError("BAD_REQUEST", `Feed between $1 and $${MAX_FEED_USD}`);
  const swapper = getAddress(args.swapper);
  const amountIn = BigInt(Math.round(args.usd * 100)) * 10_000n; // USDC has 6 decimals
  const slippagePct = env().FEED_SLIPPAGE_PCT;

  const [response, price] = await Promise.all([
    uni.quote({ swapper, tokenIn: EXTERNAL.base.usdc, tokenOut: EXTERNAL.base.w0g, amountIn, slippagePct }),
    pricePerVisit(),
  ]);
  assertUsableQuote(response, { swapper, tokenIn: EXTERNAL.base.usdc, tokenOut: EXTERNAL.base.w0g });
  const minOut = minimumOut(response.quote, slippagePct);
  const visits = Number(minOut / price);
  if (visits < 1) {
    throw new AppError("BAD_REQUEST", "That amount doesn't cover one visit at the current price", {
      minimumW0g: formatUnits(minOut, 18),
      pricePerVisitW0g: formatUnits(price, 18),
    });
  }

  const d = await db();
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
  const stored: StoredQuote = { response, slippagePct };
  const [row] = await d
    .insert(schema.feedQuotes)
    .values({ familiarId: f.id, swapper: swapper.toLowerCase(), quote: stored, feedAmount: minOut.toString(), expiresAt })
    .returning({ id: schema.feedQuotes.id });

  const q = response.quote;
  return {
    quoteId: row!.id,
    label,
    swapper,
    amountInUsdc: formatUnits(amountIn, 6),
    amountInRaw: amountIn.toString(),
    expectedW0g: formatUnits(BigInt(q.output.amount), 18),
    minimumW0g: formatUnits(minOut, 18),
    feedAmountRaw: minOut.toString(),
    visits,
    pricePerVisitW0g: formatUnits(price, 18),
    priceImpactPct: typeof q.priceImpact === "number" ? q.priceImpact : null,
    gasFeeUsd: q.gasFeeUSD ?? null,
    route: q.routeString ?? null,
    uniswapRequestId: response.requestId,
    expiresAt: expiresAt.toISOString(),
  };
}

export interface WalletCall {
  to: Address;
  data: Hex;
  value: Hex;
}

export type FeedBuild =
  | {
      mode: "eip5792";
      quoteId: string;
      /** Pass straight to `wallet_sendCalls` (EIP-5792). */
      walletSendCalls: { version: "2.0.0"; chainId: Hex; from: Address; atomicRequired: true; calls: WalletCall[] };
      uniswapRequestId: string;
      feedAmountRaw: string;
      visits: number;
    }
  | {
      mode: "sequential";
      quoteId: string;
      /** Send in order with `eth_sendTransaction`, waiting for each receipt. Then confirm the last hash. */
      transactions: (WalletCall & { from: Address; chainId: Hex; label: string; gas?: Hex })[];
      uniswapRequestId: string;
      feedAmountRaw: string;
      visits: number;
    };

/**
 * Step 2: turn a stored quote into wallet calls.
 * - `eip5792`: Uniswap /swap_5792 calls (approve → Permit2.approve → UniversalRouter.execute)
 *   + W0G.approve(feeder) + feeder.feed(node, minOut), atomic, one confirmation.
 * - `sequential`: fallback for wallets without EIP-5792 — a fresh quote with the Permit2
 *   approval as a transaction (no signature), then /swap, then approve + feed.
 */
export async function buildFeed(args: { quoteId: string; swapper: Address; mode: "eip5792" | "sequential" }, uni = new UniswapClient()): Promise<FeedBuild> {
  const d = await db();
  const swapper = getAddress(args.swapper);
  const [claimed] = await d
    .update(schema.feedQuotes)
    .set({ consumed: true })
    .where(
      and(
        eq(schema.feedQuotes.id, args.quoteId),
        eq(schema.feedQuotes.swapper, swapper.toLowerCase()),
        eq(schema.feedQuotes.consumed, false),
        gt(schema.feedQuotes.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!claimed) throw new AppError("CONFLICT", "Quote expired or already used — request a new quote");

  const f = (await d.query.familiars.findFirst({ where: eq(schema.familiars.id, claimed.familiarId) }))!;
  const node = f.ensNode as Hex;
  const stored = claimed.quote as StoredQuote;
  const chainId = numberToHex(8453);
  const price = await pricePerVisit();

  if (args.mode === "eip5792") {
    const feedAmount = BigInt(claimed.feedAmount);
    const res = await uni.swap5792({ quote: stored.response.quote, permitData: stored.response.permitData });
    if (res.chainId !== 8453) throw new AppError("UPSTREAM_UNISWAP", "swap_5792 returned calls for another chain");
    if (res.from.toLowerCase() !== swapper.toLowerCase()) throw new AppError("UPSTREAM_UNISWAP", "swap_5792 returned calls for another wallet");
    if (res.calls.length === 0 || res.calls.some((c) => !c.data || c.data === "0x")) throw new AppError("UPSTREAM_UNISWAP", "swap_5792 returned empty calldata");
    const calls: WalletCall[] = [...res.calls.map((c) => ({ to: getAddress(c.to), data: c.data, value: hexValue(c.value) })), ...feedCalls(node, feedAmount)];
    log.info("feed_build", { mode: "eip5792", label: f.label, calls: calls.length, uniswapRequestId: res.requestId });
    return {
      mode: "eip5792",
      quoteId: claimed.id,
      walletSendCalls: { version: "2.0.0", chainId, from: swapper, atomicRequired: true, calls },
      uniswapRequestId: res.requestId,
      feedAmountRaw: feedAmount.toString(),
      visits: Number(feedAmount / price),
    };
  }

  const amountIn = BigInt(stored.response.quote.input.amount);
  const [approval, fresh] = await Promise.all([
    uni.checkApproval({ walletAddress: swapper, token: EXTERNAL.base.usdc, amount: amountIn }),
    uni.quote({ swapper, tokenIn: EXTERNAL.base.usdc, tokenOut: EXTERNAL.base.w0g, amountIn, slippagePct: stored.slippagePct, generatePermitAsTransaction: true }),
  ]);
  assertUsableQuote(fresh, { swapper, tokenIn: EXTERNAL.base.usdc, tokenOut: EXTERNAL.base.w0g });
  const feedAmount = minimumOut(fresh.quote, stored.slippagePct);
  if (feedAmount < price) throw new AppError("CONFLICT", "Price moved below one visit — request a new quote");
  const swapTx = fresh.swapTransaction ?? (await uni.swap({ quote: fresh.quote as ClassicQuote })).swap;

  const txs: { tx: TransactionRequest | WalletCall; label: string }[] = [];
  if (approval.cancel) txs.push({ tx: approval.cancel, label: "Reset USDC allowance" });
  if (approval.approval) txs.push({ tx: approval.approval, label: "Approve USDC for Permit2" });
  if (fresh.permitTransaction) txs.push({ tx: fresh.permitTransaction, label: "Permit2 allowance for Uniswap" });
  txs.push({ tx: swapTx, label: "Swap USDC → W0G (Uniswap)" });
  const [approveW0g, feed] = feedCalls(node, feedAmount);
  txs.push({ tx: approveW0g!, label: "Approve W0G for FamiliarFeeder" }, { tx: feed!, label: `Feed ${f.label}` });

  log.info("feed_build", { mode: "sequential", label: f.label, txs: txs.length, uniswapRequestId: fresh.requestId });
  return {
    mode: "sequential",
    quoteId: claimed.id,
    transactions: txs.map(({ tx, label }) => ({
      from: swapper,
      to: getAddress(tx.to),
      data: tx.data,
      value: hexValue(tx.value),
      chainId,
      label,
      ...("gasLimit" in tx && tx.gasLimit ? { gas: numberToHex(BigInt(tx.gasLimit)) } : {}),
    })),
    uniswapRequestId: fresh.requestId,
    feedAmountRaw: feedAmount.toString(),
    visits: Number(feedAmount / price),
  };
}

/**
 * Step 3: the client reports the Base transaction hash (the 5792 batch's tx, or the final `feed`
 * tx). We read the receipt ourselves and credit only `Fed` events from our FamiliarFeeder whose
 * node matches a known Familiar. Idempotent per (txHash, logIndex).
 */
export async function confirmFeed(txHash: Hex) {
  const result = await verifyFeedTx(txHash);
  if (result.status === "pending") return { status: "pending" as const, txHash };
  const d = await db();
  const credited: { label: string; visits: number; amountW0g: string; logIndex: number }[] = [];
  for (const ev of result.feeds) {
    const f = await d.query.familiars.findFirst({ where: eq(schema.familiars.ensNode, ev.familiarNode.toLowerCase()) });
    if (!f) {
      log.warn("feed_unknown_node", { txHash, node: ev.familiarNode });
      continue;
    }
    const inserted = await d
      .insert(schema.feeds)
      .values({
        familiarId: f.id,
        txHash: txHash.toLowerCase(),
        logIndex: ev.logIndex,
        feeder: ev.feeder.toLowerCase(),
        amount: ev.amount.toString(),
        visitsCredited: ev.visits,
        blockNumber: ev.blockNumber,
      })
      .onConflictDoNothing()
      .returning({ id: schema.feeds.id });
    if (inserted.length) credited.push({ label: f.label, visits: ev.visits, amountW0g: formatUnits(ev.amount, 18), logIndex: ev.logIndex });
  }
  const label = credited[0]?.label ?? (await labelForNode(result.feeds[0]!.familiarNode));
  const f = label ? await getFamiliarRow(label) : undefined;
  return {
    status: "confirmed" as const,
    txHash,
    credited,
    feedCredits: f ? await feedCredits(f.id) : 0,
    basescan: `https://basescan.org/tx/${txHash}`,
  };
}

async function labelForNode(node: Hex) {
  const d = await db();
  const f = await d.query.familiars.findFirst({ where: eq(schema.familiars.ensNode, node.toLowerCase()) });
  return f?.label;
}

/** Normalize Uniswap's value field (hex like "0x00" or decimal) to a minimal hex quantity. */
export function hexValue(v: string | undefined): Hex {
  if (!v) return "0x0";
  return numberToHex(BigInt(v));
}

export type { Permit };
