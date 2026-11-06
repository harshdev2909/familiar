import "server-only";
import {
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  fallback,
  getAddress,
  http,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { base, sepolia } from "viem/chains";
import { defineChain } from "viem";
import { env } from "../env";
import { AppError } from "../errors";
import { log } from "../log";
import { deployments } from "./abis.generated";

export const zgMainnet = defineChain({
  id: 16661,
  name: "0G Mainnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
  blockExplorers: { default: { name: "0G Chainscan", url: "https://chainscan.0g.ai" } },
});

export type ChainKey = "sepolia" | "base" | "zg";
const CHAINS: Record<ChainKey, Chain> = { sepolia, base, zg: zgMainnet };

const rpc = (k: ChainKey) => ({ sepolia: env().SEPOLIA_RPC, base: env().BASE_RPC, zg: env().ZG_RPC })[k];

const publics = new Map<ChainKey, PublicClient>();

export function publicClient(k: ChainKey): PublicClient {
  let c = publics.get(k);
  if (!c) {
    c = createPublicClient({
      chain: CHAINS[k],
      transport: fallback([http(rpc(k), { retryCount: 3, retryDelay: 400, timeout: 20_000 })]),
      batch: { multicall: k !== "zg" },
      pollingInterval: 1_000,
    }) as PublicClient;
    publics.set(k, c);
  }
  return c;
}

let agentAccount: Account | undefined;
let operatorAccount: Account | undefined;

export function agent(): Account {
  agentAccount ??= privateKeyToAccount(env().AGENT_PRIVATE_KEY as Hash, { nonceManager });
  return agentAccount;
}

export function operator(): Account {
  const pk = env().OPERATOR_PRIVATE_KEY;
  if (!pk || pk.toLowerCase() === env().AGENT_PRIVATE_KEY.toLowerCase()) return agent();
  operatorAccount ??= privateKeyToAccount(pk as Hash, { nonceManager });
  return operatorAccount;
}

export function contracts() {
  const e = env();
  const d = deployments as Record<string, Record<string, string>>;
  const pick = (override: string | undefined, chainId: string, name: string): Address => {
    const a = override ?? d[chainId]?.[name];
    if (!a) throw new AppError("NOT_CONFIGURED", `${name} address is not configured`);
    return getAddress(a);
  };
  return {
    registry: pick(e.FAMILIAR_REGISTRY_ADDRESS, "11155111", "FamiliarRegistry"),
    feeder: pick(e.FAMILIAR_FEEDER_ADDRESS, "8453", "FamiliarFeeder"),
    log: pick(e.FAMILIAR_LOG_ADDRESS, "16661", "FamiliarLog"),
  };
}

/** ENSv2 + Base constants (verified onchain, see contracts/script/Addresses.sol). */
export const EXTERNAL = {
  universalResolverV2: getAddress("0x85eDf8B6b7D4211e2b07AA687506B746357B92cf"),
  ethRegistry: getAddress("0x67b728a792e789a8978b30cF1b3b641f19354b43"),
  base: {
    usdc: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    w0g: getAddress("0x23cd099eB438CcA50349EE2BC809196b1ae00861"),
    w0gUsdcPool: getAddress("0xe03cCe449932219fc0Ca28f3a4f784CE55dE0c4e"),
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Serialized writes: one queue per (chain, account) so concurrent requests never race nonces
// inside an instance; viem's nonceManager tracks pending nonces, and "nonce too low" is retried
// with a fresh nonce for the multi-instance case.
// ---------------------------------------------------------------------------------------------

const queues = new Map<string, Promise<unknown>>();

function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(key, next.catch(() => undefined));
  return next;
}

export interface WriteArgs {
  chain: ChainKey;
  account: Account;
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  /** Human label for logs/errors. */
  label: string;
}

/** Simulate, send, and wait for a successful receipt. Reverts become AppError with the decoded reason. */
export async function write(w: WriteArgs): Promise<TransactionReceipt> {
  return serialize(`${w.chain}:${w.account.address}`, async () => {
    const pc = publicClient(w.chain);
    const wallet = createWalletClient({ account: w.account, chain: CHAINS[w.chain], transport: http(rpc(w.chain), { retryCount: 2, timeout: 30_000 }) });
    for (let attempt = 1; ; attempt++) {
      try {
        const { request } = await pc.simulateContract({
          account: w.account,
          address: w.address,
          abi: w.abi as never,
          functionName: w.functionName as never,
          args: w.args as never,
        });
        // Amsterdam (Sepolia) reprices state creation; pad the node's estimate.
        const gas = await pc.estimateContractGas({ ...(request as object), account: w.account } as never);
        const hash = await wallet.writeContract({ ...(request as object), gas: (gas * 13n) / 10n } as never);
        const receipt = await pc.waitForTransactionReceipt({ hash, timeout: env().TX_RECEIPT_TIMEOUT_MS, retryCount: 10 });
        if (receipt.status !== "success") throw new AppError("UPSTREAM_CHAIN", `${w.label} reverted onchain`, { hash });
        log.info("tx", { chain: w.chain, label: w.label, hash, gasUsed: receipt.gasUsed });
        return receipt;
      } catch (e) {
        if (e instanceof AppError) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < 3 && /nonce too low|replacement transaction underpriced|already known/i.test(msg)) {
          w.account.nonceManager?.reset({ address: w.account.address, chainId: CHAINS[w.chain].id });
          continue;
        }
        throw new AppError("UPSTREAM_CHAIN", `${w.label} failed: ${revertReason(e) ?? shortMessage(e)}`, undefined, { cause: e });
      }
    }
  });
}

export function revertReason(e: unknown): string | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
  if (rev instanceof ContractFunctionRevertedError) {
    return rev.data?.errorName ? `${rev.data.errorName}(${(rev.data.args ?? []).map(String).join(", ")})` : rev.reason;
  }
  return undefined;
}

const shortMessage = (e: unknown) => (e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e));

export const explorer = {
  sepoliaTx: (h: string) => `https://sepolia.etherscan.io/tx/${h}`,
  baseTx: (h: string) => `https://basescan.org/tx/${h}`,
  zgTx: (h: string) => `https://chainscan.0g.ai/tx/${h}`,
  sepoliaAddress: (a: string) => `https://sepolia.etherscan.io/address/${a}`,
};
