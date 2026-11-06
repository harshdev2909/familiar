"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { ChevronLeft, ChevronRight, QrCode, Sparkles, Wallet } from "lucide-react";
import type { Connector } from "wagmi";
import { useState } from "react";
import { isApiError } from "@/lib/api";
import { useSession, zeroGEnabled } from "@/lib/session";
import { type WalletOption, useWallets } from "@/lib/wallets";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

function messageOf(e: unknown) {
  if (isApiError(e)) return e.message;
  const m = e instanceof Error ? e.message : String(e);
  if (/rejected|denied|cancel/i.test(m)) return "Request cancelled in your wallet";
  if (/already pending|already processing/i.test(m)) return "Your wallet already has a request open — check it";
  if (/finish updating|locked|unlock/i.test(m)) return "Open your wallet and unlock it, then try again";
  if (/provider not found|no provider|not installed/i.test(m)) return "That wallet isn't available in this browser — pick another";
  return "Couldn't sign in — try again";
}

function ZeroGButton({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const { completeZeroG } = useSession();
  const { getAccessToken, authenticated, ready } = usePrivy();
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No 0G session");
      await completeZeroG(token);
      onDone();
    } catch (e) {
      onError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const { login } = useLogin({ onComplete: () => void finish(), onError: () => setBusy(false) });
  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full justify-between"
      loading={busy}
      disabled={!ready}
      onClick={() => {
        setBusy(true);
        if (authenticated) void finish();
        else login();
      }}
    >
      <span className="inline-flex items-center gap-2">
        <Sparkles className="size-4" aria-hidden /> Sign in with 0G
      </span>
      <span className="text-xs font-normal opacity-80">uses your daily credits</span>
    </Button>
  );
}

function WalletIcon({ option }: { option: WalletOption }) {
  const box = "grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted ring-1 ring-border";
  if (option.icon)
    return (
      <span className={box}>
        {/* EIP-6963 icons are data: URIs supplied by the wallet itself. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={option.icon} alt="" className="size-6" />
      </span>
    );
  if (option.kind === "smart")
    return (
      <span className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/base.svg" alt="" className="size-6" />
      </span>
    );
  return <span className={box}>{option.kind === "mobile" ? <QrCode className="size-5" aria-hidden /> : <Wallet className="size-5" aria-hidden />}</span>;
}

const GET_A_WALLET = [
  { name: "MetaMask", href: "https://metamask.io/download" },
  { name: "Rabby", href: "https://rabby.io" },
  { name: "Coinbase Wallet", href: "https://www.coinbase.com/wallet/downloads" },
];

function WalletList({ onPick, busyId, onBack }: { onPick: (c: Connector) => void; busyId: string | null; onBack: () => void }) {
  const wallets = useWallets();
  const installed = wallets.some((w) => w.kind === "installed" || w.kind === "browser");
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" aria-hidden /> Back
      </button>
      <ul className="flex flex-col gap-2" aria-label="Wallets">
        {wallets.map((w) => (
          <li key={w.connector.uid}>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => onPick(w.connector)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-left transition hover:border-primary/40 hover:bg-accent disabled:opacity-60"
            >
              <WalletIcon option={w} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{busyId === w.connector.uid ? "Check your wallet…" : w.hint}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {!installed && (
        <p className="pt-1 text-xs text-muted-foreground">
          No browser wallet here. Get one:{" "}
          {GET_A_WALLET.map((g, i) => (
            <span key={g.name}>
              {i > 0 && " · "}
              <a href={g.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                {g.name}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function SignInDialog({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn?: () => void }) {
  const { signInWithWallet } = useSession();
  const [picking, setPicking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    setError(null);
    setPicking(false);
    onClose();
    onSignedIn?.();
  };
  const pick = async (connector: Connector) => {
    setBusyId(connector.uid);
    setError(null);
    try {
      await signInWithWallet(connector);
      done();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={() => {
        setPicking(false);
        onClose();
      }}
      title={picking ? "Choose a wallet" : "Meet your Familiar"}
      description={picking ? "Any Ethereum wallet works. You'll sign a message — no gas, no funds move." : "Choose how you'll keep it fed. You can switch any time."}
    >
      <div className="flex flex-col gap-3">
        {picking ? (
          <WalletList onPick={(c) => void pick(c)} busyId={busyId} onBack={() => setPicking(false)} />
        ) : (
          <>
            {zeroGEnabled && <ZeroGButton onDone={done} onError={setError} />}
            <Button variant="outline" size="lg" className="w-full justify-between" onClick={() => (setError(null), setPicking(true))}>
              <span className="inline-flex items-center gap-2">
                <Wallet className="size-4" aria-hidden /> Connect a wallet
              </span>
              <span className="text-xs font-normal text-muted-foreground">feed with $1 on Base</span>
            </Button>
          </>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
          Signing proves the wallet is yours; it never moves funds. Your voice notes are never stored.
        </p>
      </div>
    </Dialog>
  );
}
