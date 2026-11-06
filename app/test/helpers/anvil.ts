import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:net";
import type { TestProject } from "vitest/node";

/** Ask the OS for a free port, so a stale fork from an interrupted run can never be reused. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Integration global setup: anvil forks of Sepolia (ENSv2 + our registry), Base (USDC, W0G pool,
 * our Feeder) and 0G mainnet (our FamiliarLog). Everything onchain is the real deployed state;
 * transactions only ever touch the local forks.
 */
// Several upstreams per chain: the first that answers is forked (public RPCs go down).
const FORKS = [
  { key: "SEPOLIA_RPC", urls: [process.env.FORK_SEPOLIA, "https://sepolia.gateway.tenderly.co", "https://ethereum-sepolia-rpc.publicnode.com", "https://0xrpc.io/sep", "https://1rpc.io/sepolia"] },
  { key: "BASE_RPC", urls: [process.env.FORK_BASE, "https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://1rpc.io/base"] },
  { key: "ZG_RPC", urls: [process.env.FORK_ZG, "https://evmrpc.0g.ai"] },
] as const;

async function firstLive(urls: readonly (string | undefined)[]): Promise<string> {
  for (const url of urls) {
    if (!url) continue;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok && (await r.json()).result) return url;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(`no reachable upstream RPC among ${urls.filter(Boolean).join(", ")}`);
}

declare module "vitest" {
  export interface ProvidedContext {
    rpcs: { SEPOLIA_RPC: string; BASE_RPC: string; ZG_RPC: string };
    agentKey: string;
  }
}

function loadContractsEnv(): Record<string, string> {
  const raw = readFileSync(resolve(__dirname, "../../../contracts/.env"), "utf8");
  return Object.fromEntries(
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

async function waitFor(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`anvil at ${url} did not start`);
}

/**
 * A fork fetches every storage slot lazily from the upstream RPC. Run the heavy paths once as
 * eth_estimateGas so the first real transaction in a test doesn't spend minutes cold-loading state.
 */
async function warm(rpcs: Record<string, string>, agentKey: string) {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { encodeFunctionData, parseAbi } = await import("viem");
  const agent = privateKeyToAccount(agentKey as `0x${string}`).address;
  const call = (url: string, method: string, params: unknown[]) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());
  const hatch = encodeFunctionData({ abi: parseAbi(["function hatch(string,address)"]), functionName: "hatch", args: [`warm${Date.now()}`, "0x000000000000000000000000000000000000dEaD"] });
  const quote = encodeFunctionData({
    abi: parseAbi(["function quoteExactInputSingle((address,address,uint256,uint24,uint160))"]),
    functionName: "quoteExactInputSingle",
    args: [["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0x23cd099eB438CcA50349EE2BC809196b1ae00861", 1_000_000n, 3000, 0n]],
  });
  const t = Date.now();
  await Promise.all([
    call(rpcs.SEPOLIA_RPC!, "eth_estimateGas", [{ from: agent, to: "0xe70FB7f0921E720b6e78847e2Aa7970809c63833", data: hatch }]),
    call(rpcs.BASE_RPC!, "eth_call", [{ to: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", data: quote }, "latest"]),
  ]);
  console.log(`[integration] forks warmed in ${Math.round((Date.now() - t) / 1000)}s`);
}

export default async function setup(project: TestProject) {
  const procs: ChildProcess[] = [];
  const rpcs = {} as Record<(typeof FORKS)[number]["key"], string>;
  for (const f of FORKS) {
    const url = await firstLive(f.urls);
    const port = await freePort();
    const logDir = process.env.ANVIL_LOG_DIR;
    // Interval mining like a real chain: viem re-checks receipts on new blocks, and automine never
    // produces one after the tx block (a receipt check that races the mining would wait forever).
    const args = ["--fork-url", url, "--port", String(port), "--block-time", "1", "--no-rate-limit", "--retries", "10", "--fork-retry-backoff", "500", "--timeout", "60000"];
    const p = spawn("anvil", logDir ? args : [...args, "--silent"], { stdio: logDir ? ["ignore", "pipe", "pipe"] : "ignore" });
    if (logDir) {
      mkdirSync(logDir, { recursive: true });
      const out = createWriteStream(`${logDir}/anvil-${f.key}.log`);
      p.stdout?.pipe(out);
      p.stderr?.pipe(out);
    }
    procs.push(p);
    rpcs[f.key] = `http://127.0.0.1:${port}`;
  }
  await Promise.all(Object.values(rpcs).map(waitFor));
  const env = loadContractsEnv();
  if (!env.AGENT_PRIVATE_KEY) throw new Error("contracts/.env must define AGENT_PRIVATE_KEY (the deployed agent) for integration tests");
  await warm(rpcs, env.AGENT_PRIVATE_KEY);
  project.provide("rpcs", rpcs);
  project.provide("agentKey", env.AGENT_PRIVATE_KEY);
  const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
  // Kill the forks even if the run is interrupted.
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return stop;
}
