"use client";

import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Hex } from "viem";
import { connect, getConnection, sendCalls, sendTransaction, switchChain, waitForCallsStatus, waitForTransactionReceipt } from "wagmi/actions";
import { base } from "wagmi/chains";
import { api, isApiError } from "@/lib/api";
import type { FeedQuoteView, WalletCall } from "@/lib/api-types";
import { useSession } from "@/lib/session";
import { wagmiConfig } from "@/lib/wagmi";
import { restoreConnection } from "@/lib/wallets";
import { MASCOT } from "@/lib/art";
import { Mascot } from "../art/Mascot";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

type Phase = "ready" | "signing" | "confirming" | "done" | "error";

const unsupported5792 = (e: unknown) => /wallet_sendCalls|4200|not supported|unsupported|does not support|Method not found/i.test(e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ""}` : String(e));
const rejected = (e: unknown) => /reject|denied|cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * Feed $1: Uniswap quote → one EIP-5792 batch (swap + approve + feed) → backend verifies the Fed
 * event. Falls back to ordered transactions on wallets without wallet_sendCalls.
 */
export function FeedDialog({ name, open, onClose, onFed }: { name: string; open: boolean; onClose: () => void; onFed: (credits: number) => void }) {
  const { session } = useSession();
  const [phase, setPhase] = useState<Phase>("ready");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  // Quotes are single-use and valid ~30 s: fetched fresh each time the dialog opens, refreshed every 25 s.
  const q = useQuery({
    queryKey: ["feed-quote", name],
    queryFn: () => api.feedQuote(name, 1),
    enabled: open && phase === "ready",
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 25_000,
    retry: false,
  });
  const quote: FeedQuoteView | null = q.data ?? null;
  const quoting = q.isFetching && !quote;
  const quoteError = q.error ? (isApiError(q.error) ? q.error.message : "Couldn't get a price right now") : null;

  const confirm = async (hash: string) => {
    setTxHash(hash);
    setPhase("confirming");
    setStatus("Waiting for Base to confirm…");
    for (let i = 0; i < 40; i++) {
      const r = await api.feedConfirm(hash);
      if (r.status === "confirmed") {
        setPhase("done");
        onFed(r.feedCredits ?? 0);
        return;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    throw new Error("Confirmation is taking longer than usual");
  };

  const sequential = async () => {
    const fresh = await api.feedQuote(name, 1);
    const build = await api.feedBuild(fresh.quoteId, "sequential");
    if (build.mode !== "sequential") throw new Error("unexpected build");
    let last: Hex | undefined;
    for (const [i, tx] of build.transactions.entries()) {
      setStatus(`Step ${i + 1} of ${build.transactions.length}: ${tx.label}`);
      last = await sendTransaction(wagmiConfig, { to: tx.to, data: tx.data, value: BigInt(tx.value), chainId: base.id });
      const r = await waitForTransactionReceipt(wagmiConfig, { hash: last, chainId: base.id });
      if (r.status !== "success") throw new Error(`${tx.label} failed`);
    }
    return last!;
  };

  const feed = async () => {
    if (!quote) return;
    setPhase("signing");
    setError(null);
    try {
      // The session survives reloads; the wallet connection doesn't. Reconnect, and make sure it's
      // the same account that signed in (the quote and calls are built for that address).
      let conn = getConnection(wagmiConfig);
      if (!conn.isConnected) {
        setStatus("Connect your wallet");
        conn = getConnection(wagmiConfig);
        if (!conn.isConnected) {
          const connector = await restoreConnection();
          if (!connector) throw new Error("No wallet found — install one or use Coinbase Smart Wallet");
          await connect(wagmiConfig, { connector, chainId: base.id });
          conn = getConnection(wagmiConfig);
        }
      }
      if (session && conn.address?.toLowerCase() !== session.address.toLowerCase()) {
        throw new Error(`Switch your wallet to ${session.address.slice(0, 6)}…${session.address.slice(-4)}, the account you signed in with`);
      }
      if (conn.chainId !== base.id) await switchChain(wagmiConfig, { chainId: base.id });
      let hash: string;
      try {
        setStatus("Confirm once in your wallet");
        const build = await api.feedBuild(quote.quoteId, "eip5792");
        if (build.mode !== "eip5792") throw new Error("unexpected build");
        const { id } = await sendCalls(wagmiConfig, {
          chainId: base.id,
          calls: build.walletSendCalls.calls.map((c: WalletCall) => ({ to: c.to, data: c.data, value: BigInt(c.value) })),
          forceAtomic: true,
        });
        setStatus("Swapping and feeding…");
        const res = await waitForCallsStatus(wagmiConfig, { id, timeout: 180_000 });
        if (res.status !== "success" || !res.receipts?.length) throw new Error("The batch didn't go through");
        hash = res.receipts.at(-1)!.transactionHash;
      } catch (e) {
        if (rejected(e)) throw e;
        if (!unsupported5792(e)) throw e;
        hash = await sequential();
      }
      await confirm(hash);
    } catch (e) {
      setError(rejected(e) ? "Cancelled in your wallet" : isApiError(e) ? e.message : e instanceof Error ? e.message : "Feeding failed");
      setPhase("error");
    }
  };

  const close = () => {
    setPhase("ready");
    setError(null);
    setStatus("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} title={`Feed ${name}`} description="$1 of USDC on Base becomes one visit.">
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-wash p-5">
          {quoting ? (
            <div className="h-[68px] animate-pulse rounded-xl bg-muted" aria-label="Getting a price" />
          ) : quote ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                <span>$1</span>
                <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
                <span className="font-mono tabular-nums">{Number(quote.expectedW0g).toFixed(2)} W0G</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {quote.visits} visit · price impact {quote.priceImpactPct?.toFixed(2) ?? "—"}% · via Uniswap
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No price yet.</p>
          )}
        </div>

        {phase === "done" ? (
          <div className="flex flex-col gap-3" role="status">
            <Mascot src={MASCOT.fed} size={96} className="self-center" />
            <p className="text-center text-lg font-semibold">{name} is fed.</p>
            {txHash && (
              <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline underline-offset-2">
                View on Basescan
              </a>
            )}
            <Button onClick={close}>Back to {name}</Button>
          </div>
        ) : (
          <>
            {(phase === "signing" || phase === "confirming") && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {status}
              </p>
            )}
            {(error ?? quoteError) && (
              <p className="text-sm text-destructive" role="alert">
                {error ?? quoteError}
              </p>
            )}
            <Button
              size="lg"
              onClick={() => {
                if (!quote || phase === "error") {
                  setPhase("ready");
                  setError(null);
                  void q.refetch();
                } else void feed();
              }}
              loading={phase === "signing" || phase === "confirming" || quoting}
            >
              {phase === "error" || !quote ? "Get a fresh price" : "Feed $1"}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">One confirmation swaps USDC to W0G and leaves it with {name}. A tiny amount of ETH on Base covers gas.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
