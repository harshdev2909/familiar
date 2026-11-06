import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type Address, type PublicClient, encodeFunctionData, erc20Abi, parseAbi } from "viem";

const SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481" as const;
const QUOTER_V2 = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const;
const swapRouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
]);

export interface Recorded {
  path: string;
  auth: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function listen(server: Server): Promise<string> {
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

// A tiny real PNG (1x1) so media sniffing and storage are exercised.
const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** OpenAI-compatible 0G Router stand-in that mimics x_0g_trace + X-Request-ID. */
export async function mockZeroG(o: { privyWallet: () => Address }) {
  const calls: Recorded[] = [];
  let n = 0;
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const path = (req.url ?? "").split("?")[0]!.replace(/^\/v1/, "");
    const isJson = (req.headers["content-type"] ?? "").includes("json");
    calls.push({ path, auth: req.headers.authorization, headers: req.headers, body: isJson && raw.length ? JSON.parse(raw.toString()) : raw.length });
    const id = `0g-req-${++n}`;
    const trace = { request_id: id, provider: "0x00000000000000000000000000000000000000Aa", billing: { total_cost: "910", currency: "usd" }, tee_verified: true };
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "x-request-id": id });
      res.end(JSON.stringify(body));
    };
    if (path === "/auth/privy") return send(200, { token: "zg-user-session-jwt", wallet_address: o.privyWallet() });
    if (path === "/account/balance") return send(200, { credit_balance: "1271000", deposit_balance: "0", total_balance: "1271000", pending_charge: "0", currency: "usd" });
    if (path === "/audio/transcriptions") return send(200, { text: "Rough day. Our demo broke twice but we fixed it at 3am.", x_0g_trace: trace });
    if (path === "/chat/completions") {
      const content = JSON.stringify({
        mood: "proud",
        reply: "You fixed it at 3am — I kept a tiny wrench warm for you.",
        memory_update: "Their human builds things under pressure and keeps going; tonight a broken demo got fixed late.",
        image_prompt: "the creature holding a tiny wrench beside a glowing laptop at night",
      });
      return send(200, { id: `chat-${id}`, choices: [{ message: { role: "assistant", content } }], x_0g_trace: trace });
    }
    if (path === "/images/generations") return send(200, { data: [{ b64_json: PNG_1x1 }], x_0g_trace: trace });
    if (path === "/audio/speech") {
      res.writeHead(200, { "content-type": "audio/mpeg", "x-request-id": `gw${n}, ${id}` });
      return res.end(Buffer.from("ID3-mock-mp3"));
    }
    if (path === "/videos") return send(200, { id: `vid-${id}`, status: "queued" });
    const vid = path.match(/^\/videos\/([^/]+)(\/content)?$/);
    if (vid?.[2]) {
      res.writeHead(200, { "content-type": "video/mp4" });
      return res.end(Buffer.from("mock-mp4"));
    }
    if (vid) return send(200, { id: vid[1], status: "completed", x_0g_trace: { request_id: `async-${vid[1]}`, billing: { total_cost: "217280", currency: "usd" } } });
    send(404, { error: { code: "not_found", message: path } });
  });
  const url = await listen(server);
  return { url: `${url}/v1`, calls, close: () => server.close() };
}

/**
 * Uniswap Trading API stand-in: quotes come from the REAL Base QuoterV2 (on the fork) and the
 * returned calls are REAL SwapRouter02 calldata against the live W0G/USDC pool, so the feed batch
 * executes for real on the fork. (The hosted API routes via Permit2 + UniversalRouter; the
 * semantics — approve, swap to the swapper, min output — are the same.)
 */
export async function mockUniswap(base: PublicClient) {
  const calls: Recorded[] = [];
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const path = (req.url ?? "").replace(/^\/v1/, "");
    const body = raw.length ? JSON.parse(raw.toString()) : {};
    calls.push({ path, auth: req.headers["x-api-key"] as string, headers: req.headers, body });
    const send = (status: number, b: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(b));
    };
    try {
      if (path === "/quote") {
        const { result } = await base.simulateContract({
          address: QUOTER_V2,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: body.tokenIn, tokenOut: body.tokenOut, amountIn: BigInt(body.amount), fee: 3000, sqrtPriceLimitX96: 0n }],
        });
        const out = result[0];
        const min = (out * BigInt(10_000 - Math.round(body.slippageTolerance * 100))) / 10_000n;
        const quote = {
          input: { amount: body.amount, token: body.tokenIn },
          output: { amount: out.toString(), token: body.tokenOut, recipient: body.swapper, minimumAmount: min.toString() },
          swapper: body.swapper,
          chainId: 8453,
          slippage: body.slippageTolerance,
          tradeType: "EXACT_INPUT",
          route: [[{ type: "v3-pool", address: "0xe03cCe449932219fc0Ca28f3a4f784CE55dE0c4e", fee: "3000" }]],
          routeString: "[V3] 100.00% = USDC -- 0.3% [0xe03c] --> W0G",
          priceImpact: 0.1,
          gasFeeUSD: "0.002",
          aggregatedOutputs: [{ token: body.tokenOut, amount: out.toString(), recipient: body.swapper, bps: 10000, minAmount: min.toString() }],
        };
        const swapTransaction = {
          to: SWAP_ROUTER_02,
          from: body.swapper,
          value: "0x00",
          chainId: 8453,
          data: encodeFunctionData({
            abi: swapRouterAbi,
            functionName: "exactInputSingle",
            args: [{ tokenIn: body.tokenIn, tokenOut: body.tokenOut, fee: 3000, recipient: body.swapper, amountIn: BigInt(body.amount), amountOutMinimum: min, sqrtPriceLimitX96: 0n }],
          }),
        };
        return send(200, { requestId: `uni-q-${calls.length}`, routing: "CLASSIC", quote, permitData: null, ...(body.generatePermitAsTransaction && { permitTransaction: null, swapTransaction }) });
      }
      if (path === "/check_approval") {
        return send(200, {
          requestId: "uni-a",
          approval: { to: body.token, from: body.walletAddress, value: "0x00", chainId: 8453, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SWAP_ROUTER_02, BigInt(body.amount)] }) },
          cancel: null,
        });
      }
      if (path === "/swap_5792") {
        const q = body.quote;
        return send(200, {
          requestId: "uni-5792",
          from: q.swapper,
          chainId: 8453,
          calls: [
            { to: q.input.token, value: "0x00", data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SWAP_ROUTER_02, BigInt(q.input.amount)] }) },
            {
              to: SWAP_ROUTER_02,
              value: "0x00",
              data: encodeFunctionData({
                abi: swapRouterAbi,
                functionName: "exactInputSingle",
                args: [{ tokenIn: q.input.token, tokenOut: q.output.token, fee: 3000, recipient: q.swapper, amountIn: BigInt(q.input.amount), amountOutMinimum: BigInt(q.aggregatedOutputs[0].minAmount), sqrtPriceLimitX96: 0n }],
              }),
            },
          ],
        });
      }
      send(404, { errorCode: "ResourceNotFound", detail: path });
    } catch (e) {
      send(500, { errorCode: "InternalServerError", detail: e instanceof Error ? e.message : String(e) });
    }
  });
  const url = await listen(server);
  return { url: `${url}/v1`, calls, close: () => server.close() };
}
