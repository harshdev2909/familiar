import { describe, expect, it, vi } from "vitest";
import { UNIVERSAL_ROUTER_VERSION, UniswapApiError, UniswapClient, assertUsableQuote, minimumOut, type QuoteResponse } from "@/server/uniswap/client";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const W0G = "0x23cd099eB438CcA50349EE2BC809196b1ae00861";
const SWAPPER = "0x04b4534A84C25992A958B60e96995269Cd744258";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function quote(over: Partial<QuoteResponse["quote"]> = {}, routing = "CLASSIC"): QuoteResponse {
  return {
    requestId: "rq-1",
    routing,
    permitData: null,
    quote: {
      input: { amount: "1000000", token: USDC },
      output: { amount: "6500000000000000000", token: W0G, recipient: SWAPPER },
      swapper: SWAPPER,
      chainId: 8453,
      slippage: 1,
      tradeType: "EXACT_INPUT",
      route: [],
      ...over,
    },
  };
}

describe("UniswapClient", () => {
  it("sends the API key, JSON headers and a pinned Universal Router version", async () => {
    const f = vi.fn(async () => json(200, quote()));
    const c = new UniswapClient({ apiKey: "k", baseUrl: "https://api.test/v1", fetch: f as never });
    await c.quote({ swapper: SWAPPER, tokenIn: USDC, tokenOut: W0G, amountIn: 1_000_000n, slippagePct: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/v1/quote");
    const h = init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("k");
    expect(h["x-universal-router-version"]).toBe(UNIVERSAL_ROUTER_VERSION);
    expect(h["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ type: "EXACT_INPUT", amount: "1000000", tokenInChainId: 8453, tokenOutChainId: 8453, swapper: SWAPPER, slippageTolerance: 1 });
    expect(body.protocols).not.toContain("UNISWAPX");
    expect(body.autoSlippage).toBeUndefined(); // exactly one of slippageTolerance | autoSlippage
  });

  it("retries 429 / 5xx and then succeeds", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(429, { errorCode: "Ratelimited", detail: "slow" }))
      .mockResolvedValueOnce(json(504, { errorCode: "Timeout", detail: "t" }))
      .mockResolvedValueOnce(json(200, quote()));
    const c = new UniswapClient({ apiKey: "k", fetch: f as never });
    const r = await c.quote({ swapper: SWAPPER, tokenIn: USDC, tokenOut: W0G, amountIn: 1n, slippagePct: 1 });
    expect(r.requestId).toBe("rq-1");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("maps errorCode/detail and does not retry 4xx", async () => {
    const f = vi.fn(async () => json(404, { errorCode: "NoRouteFoundError", detail: "No quotes available", requestId: "up-9" }));
    const c = new UniswapClient({ apiKey: "k", fetch: f as never });
    const err = await c.quote({ swapper: SWAPPER, tokenIn: USDC, tokenOut: W0G, amountIn: 1n, slippagePct: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(UniswapApiError);
    expect(err.code).toBe("UPSTREAM_UNISWAP");
    expect(err.errorCode).toBe("NoRouteFoundError");
    expect(err.upstreamRequestId).toBe("up-9");
    expect(err.message).toMatch(/no route/i);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("swap_5792 forwards the quote and permitData unchanged", async () => {
    const f = vi.fn(async () => json(200, { requestId: "s", from: SWAPPER, chainId: 8453, calls: [] }));
    const c = new UniswapClient({ apiKey: "k", fetch: f as never });
    const q = quote();
    await c.swap5792({ quote: q.quote, permitData: { domain: {}, types: {}, values: { a: 1 } } });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.quote).toEqual(q.quote);
    expect(body.permitData.values).toEqual({ a: 1 });
    expect(body.signature).toBeUndefined(); // 5792 takes no signature
  });
});

describe("quote safety", () => {
  it("minimumOut prefers aggregatedOutputs.minAmount, then output.minimumAmount, then slippage math", () => {
    expect(minimumOut(quote({ aggregatedOutputs: [{ token: W0G, amount: "1", recipient: SWAPPER, minAmount: "42" }], output: { amount: "100", token: W0G, minimumAmount: "90" } }).quote, 1)).toBe(42n);
    expect(minimumOut(quote({ output: { amount: "100", token: W0G, minimumAmount: "90" } }).quote, 1)).toBe(90n);
    expect(minimumOut(quote({ output: { amount: "10000", token: W0G } }).quote, 1)).toBe(9900n);
  });

  const expectOk = { swapper: SWAPPER, tokenIn: USDC, tokenOut: W0G } as const;
  it("accepts a plain CLASSIC Base quote", () => expect(() => assertUsableQuote(quote(), expectOk)).not.toThrow());
  it("rejects UniswapX routing", () => expect(() => assertUsableQuote(quote({}, "DUTCH_V2"), expectOk)).toThrow(/routing/));
  it("rejects wrong tokens", () => expect(() => assertUsableQuote(quote({ output: { amount: "1", token: USDC } }), expectOk)).toThrow(/tokens/));
  it("rejects a different recipient", () =>
    expect(() => assertUsableQuote(quote({ output: { amount: "1", token: W0G, recipient: "0x000000000000000000000000000000000000dEaD" } }), expectOk)).toThrow(/recipient/));
  it("rejects predicted failures", () => expect(() => assertUsableQuote(quote({ txFailureReasons: ["SIMULATION_ERROR"] }), expectOk)).toThrow(/fail/));
  it("rejects other chains", () => expect(() => assertUsableQuote(quote({ chainId: 1 }), expectOk)).toThrow(/Base/));
});
