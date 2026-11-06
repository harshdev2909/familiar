import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://familiar.app";
/** WalletConnect (Reown) project id — enables mobile wallets via QR / deep link. Optional. */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/**
 * Base only: feeds are USDC → W0G swaps on Base, and sign-in messages are bound to chain 8453.
 * Wallets: every installed browser wallet is discovered via EIP-6963 (MetaMask, Rabby, Phantom,
 * Coinbase, OKX, Zerion…), plus Coinbase Smart Wallet (passkeys, no install) and WalletConnect
 * for mobile wallets. The generic `injected()` is a fallback for wallets that don't announce.
 */
export const wagmiConfig = createConfig({
  chains: [base],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected({ shimDisconnect: true }),
    // Coinbase extension when installed, otherwise the Coinbase / Base Smart Wallet (passkeys, no install).
    coinbaseWallet({ appName: "Familiar", appLogoUrl: `${APP_URL}/icon.svg`, preference: { options: "all" } }),
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: { name: "Familiar", description: "A small creature that listens to your day.", url: APP_URL, icons: [`${APP_URL}/icon.svg`] },
          }),
        ]
      : []),
  ],
  transports: { [base.id]: http() },
  ssr: true,
  // Sign-in is a server session; the wallet is only needed on demand (sign-in, feeding).
  storage: createStorage({ storage: cookieStorage }),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
