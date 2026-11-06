import "server-only";
import type { Address, Hex } from "viem";
import { env } from "../env";
import { AppError } from "../errors";
import { log } from "../log";

export const UNIVERSAL_ROUTER_VERSION = "2.1.2";
export const BASE_CHAIN_ID = 8453;

export interface TransactionRequest {
  to: Address;
  from?: Address;
  data: Hex;
  value: string;
  chainId?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

export interface Permit {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  values: Record<string, unknown>;
}

export interface ClassicQuote {
  input: { amount: string; token: string; maximumAmount?: string };
  output: { amount: string; token: string; recipient?: string; minimumAmount?: string };
  swapper: string;
  chainId: number;
  slippage: number;
  tradeType: string;
  gasFee?: string;
  gasFeeUSD?: string;
  gasUseEstimate?: string;
  route: unknown[][];
  routeString?: string;
  quoteId?: string;
  blockNumber?: string;
  priceImpact?: number;
  txFailureReasons?: string[];
  aggregatedOutputs?: { token: string; amount: string; recipient: string; bps?: number; minAmount: string }[];
  [k: string]: unknown;
}

export interface QuoteResponse {
  requestId: string;
  routing: string;
  quote: ClassicQuote;
  permitData: Permit | null;
  permitTransaction?: TransactionRequest | null;
  swapTransaction?: TransactionRequest;
  isTokenApprovalApplicable?: boolean;
}

export interface ApprovalResponse {
  requestId: string;
  approval: TransactionRequest | null;
  cancel: TransactionRequest | null;
}

export interface Swap5792Response {
  requestId: string;
  from: Address;
  chainId: number;
  calls: { to: Address; data: Hex; value: string }[];
  gasFee?: string;
}

export interface SwapResponse {
  requestId: string;
  swap: TransactionRequest;
  gasFee?: string;
}

/** Codes where an unchanged retry can succeed. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class UniswapApiError extends AppError {
  constructor(
    readonly httpStatus: number,
    readonly errorCode: string,
    readonly detail: string,
    readonly upstreamRequestId?: string,
  ) {
    super("UPSTREAM_UNISWAP", friendly(errorCode, detail), { errorCode, detail, requestId: upstreamRequestId });
  }
}

function friendly(code: string, detail: string) {
  switch (code) {
    case "NoRouteFoundError":
      return "Uniswap found no route for this swap right now";
    case "QuoteAmountTooLowError":
      return "Amount is too small to swap";
    case "InsufficientBalance":
    case "TokenBalanceNotAvailable":
      return "Not enough USDC in the wallet";
    case "Ratelimited":
      return "Uniswap is rate limiting us; try again in a moment";
    case "Unauthorized":
    case "UnauthorizedError":
      return "Uniswap API key rejected";
    default:
      return `Uniswap API: ${detail || code}`;
  }
}

export interface UniswapClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class UniswapClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(o: UniswapClientOptions = {}) {
    const key = o.apiKey ?? env().UNISWAP_API_KEY;
    if (!key) throw new AppError("NOT_CONFIGURED", "UNISWAP_API_KEY is not set");
    this.apiKey = key;
    this.baseUrl = (o.baseUrl ?? env().UNISWAP_API_URL).replace(/\/$/, "");
    this.fetchImpl = o.fetch ?? fetch;
    this.timeoutMs = o.timeoutMs ?? 15_000;
  }

  checkApproval(args: { walletAddress: Address; token: Address; amount: bigint }) {
    return this.post<ApprovalResponse>("/check_approval", {
      walletAddress: args.walletAddress,
      token: args.token,
      amount: args.amount.toString(),
      chainId: BASE_CHAIN_ID,
    });
  }

  /** Exact-input CLASSIC quote on Base. */
  quote(args: {
    swapper: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    slippagePct: number;
    generatePermitAsTransaction?: boolean;
  }) {
    return this.post<QuoteResponse>("/quote", {
      type: "EXACT_INPUT",
      amount: args.amountIn.toString(),
      tokenInChainId: BASE_CHAIN_ID,
      tokenOutChainId: BASE_CHAIN_ID,
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      swapper: args.swapper,
      slippageTolerance: args.slippagePct,
      routingPreference: "BEST_PRICE",
      // Pinning to pool protocols keeps routing CLASSIC (no UniswapX order flow).
      protocols: ["V2", "V3", "V4"],
      ...(args.generatePermitAsTransaction && { generatePermitAsTransaction: true }),
    });
  }

  swap5792(args: { quote: ClassicQuote; permitData: Permit | null; deadline?: number }) {
    return this.post<Swap5792Response>("/swap_5792", {
      quote: args.quote,
      ...(args.permitData && { permitData: args.permitData }),
      ...(args.deadline && { deadline: args.deadline }),
    });
  }

  swap(args: { quote: ClassicQuote; deadline?: number }) {
    return this.post<SwapResponse>("/swap", {
      quote: args.quote,
      simulateTransaction: false,
      refreshGasPrice: true,
      ...(args.deadline && { deadline: args.deadline }),
    });
  }

  private async post<T>(path: string, body: unknown, attempt = 1): Promise<T> {
    const started = performance.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-api-key": this.apiKey,
          "x-universal-router-version": UNIVERSAL_ROUTER_VERSION,
          "x-agent-info": JSON.stringify({ decision_origin: "human_mediated", integration_name: "familiar", version: "1" }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      if (attempt < 3) return this.retry(path, body, attempt);
      throw new AppError("UPSTREAM_UNISWAP", "Uniswap API unreachable", undefined, { cause: e });
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { detail: text.slice(0, 200) };
    }
    log.info("uniswap", { path, status: res.status, ms: Math.round(performance.now() - started), requestId: (parsed as { requestId?: string }).requestId });
    if (!res.ok) {
      const p = parsed as { errorCode?: string; detail?: string; requestId?: string };
      const code = p.errorCode ?? `HTTP_${res.status}`;
      const retryable = RETRYABLE_STATUS.has(res.status) || code === "UpstreamTimeoutError";
      if (retryable && attempt < 3) return this.retry(path, body, attempt);
      throw new UniswapApiError(res.status, code, p.detail ?? "", p.requestId);
    }
    return parsed as T;
  }

  private async retry<T>(path: string, body: unknown, attempt: number): Promise<T> {
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 100));
    return this.post<T>(path, body, attempt + 1);
  }
}

/** Guaranteed minimum output for a classic quote (post-fee), per the API's guidance. */
export function minimumOut(q: ClassicQuote, slippagePct: number): bigint {
  const agg = q.aggregatedOutputs?.[0]?.minAmount;
  if (agg) return BigInt(agg);
  if (q.output.minimumAmount) return BigInt(q.output.minimumAmount);
  const bps = BigInt(Math.round(slippagePct * 100));
  return (BigInt(q.output.amount) * (10_000n - bps)) / 10_000n;
}

/** Reject anything that isn't a plain CLASSIC Base quote for the expected pair and swapper. */
export function assertUsableQuote(r: QuoteResponse, expect: { swapper: Address; tokenIn: Address; tokenOut: Address }) {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (r.routing !== "CLASSIC") throw new AppError("UPSTREAM_UNISWAP", `Unexpected routing ${r.routing}`);
  const q = r.quote;
  if (q.chainId !== BASE_CHAIN_ID) throw new AppError("UPSTREAM_UNISWAP", "Quote is not on Base");
  if (!same(q.input.token, expect.tokenIn) || !same(q.output.token, expect.tokenOut)) {
    throw new AppError("UPSTREAM_UNISWAP", "Quote tokens do not match USDC → W0G");
  }
  if (!same(q.swapper, expect.swapper)) throw new AppError("UPSTREAM_UNISWAP", "Quote swapper mismatch");
  if (q.output.recipient && !same(q.output.recipient, expect.swapper)) {
    throw new AppError("UPSTREAM_UNISWAP", "Quote output recipient is not the swapper");
  }
  if (q.txFailureReasons?.length) {
    throw new AppError("UPSTREAM_UNISWAP", `Uniswap expects this swap to fail: ${q.txFailureReasons.join(", ")}`);
  }
}
