"use client";

import { useMemo } from "react";
import { type Connector, useConnectors } from "wagmi";
import { getConnectors, reconnect } from "wagmi/actions";
import { wagmiConfig } from "./wagmi";

export interface WalletOption {
  connector: Connector;
  name: string;
  icon: string | null;
  /** Short helper line under the name. */
  hint: string;
  kind: "installed" | "smart" | "mobile" | "browser";
}

const GENERIC = new Set(["injected"]);

function hasBrowserProvider() {
  return typeof window !== "undefined" && typeof (window as { ethereum?: unknown }).ethereum !== "undefined";
}

/** Installed wallets first (EIP-6963, deduped), then Coinbase Smart Wallet, then WalletConnect. */
export function walletOptions(connectors: readonly Connector[]): WalletOption[] {
  const announced = connectors.filter((c) => c.type === "injected" && !GENERIC.has(c.id));
  const seen = new Set<string>();
  const installed: WalletOption[] = [];
  for (const c of announced) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    installed.push({ connector: c, name: c.name, icon: c.icon ?? null, hint: "Installed", kind: "installed" });
  }
  const out = [...installed];
  // Older extensions don't announce themselves; fall back to window.ethereum only when nothing did.
  const generic = connectors.find((c) => GENERIC.has(c.id));
  if (!installed.length && generic && hasBrowserProvider()) {
    out.push({ connector: generic, name: "Browser wallet", icon: null, hint: "Detected in this browser", kind: "browser" });
  }
  // Skip the SDK entry when the Coinbase extension already announced itself.
  const smart = connectors.find((c) => c.id === "coinbaseWalletSDK");
  if (smart && !seen.has("coinbase wallet")) out.push({ connector: smart, name: "Coinbase Smart Wallet", icon: null, hint: "Passkey wallet · nothing to install", kind: "smart" });
  const wc = connectors.find((c) => c.id === "walletConnect");
  if (wc) out.push({ connector: wc, name: "WalletConnect", icon: null, hint: "Scan with any mobile wallet", kind: "mobile" });
  return out;
}

export function useWallets() {
  const connectors = useConnectors();
  return useMemo(() => walletOptions(connectors), [connectors]);
}

/**
 * For flows that need a live connection after a reload (feeding): restore the last wallet the user
 * picked, otherwise fall back to the best available option.
 */
export async function restoreConnection() {
  await reconnect(wagmiConfig).catch(() => undefined);
  const recent = await wagmiConfig.storage?.getItem("recentConnectorId");
  const options = walletOptions(getConnectors(wagmiConfig));
  return options.find((o) => o.connector.id === recent)?.connector ?? options[0]?.connector ?? null;
}
