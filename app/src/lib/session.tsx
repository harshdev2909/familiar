"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo } from "react";
import { type Connector, useConnect, useConnection, useDisconnect, useSignMessage } from "wagmi";
import { ApiError, api } from "./api";
import type { FamiliarView, SessionInfo } from "./api-types";
import { privyLogout } from "./privyBridge";

interface SessionState {
  session: SessionInfo | null;
  familiar: FamiliarView | null;
  loading: boolean;
  refresh: () => Promise<{ session: SessionInfo | null; familiar: FamiliarView | null }>;
  /** Connect the chosen wallet (or reuse the live connection) and sign in with SIWE. */
  signInWithWallet: (connector?: Connector) => Promise<SessionInfo>;
  signInDemo: () => Promise<{ session: SessionInfo; familiar: FamiliarView | null; demo: string }>;
  /** Called by the 0G (Privy) button once it has a Privy access token. */
  completeZeroG: (privyToken: string) => Promise<SessionInfo>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return { session: null, familiar: null };
        throw e;
      }
    },
    staleTime: 30_000,
  });
  const session = me.data?.session ?? null;
  const familiar = me.data?.familiar ?? null;
  const loading = me.isPending;
  const set = useCallback((v: { session: SessionInfo | null; familiar: FamiliarView | null }) => qc.setQueryData(["me"], v), [qc]);
  const { mutateAsync: connectAsync } = useConnect();
  const { address, connector: active } = useConnection();
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const { mutateAsync: disconnectAsync } = useDisconnect();

  const refresh = useCallback(async () => {
    const r = await me.refetch();
    return r.data ?? { session: null, familiar: null };
  }, [me]);

  const signInWithWallet = useCallback(async (connector?: Connector) => {
    let account = address;
    if (connector && active && active.uid !== connector.uid) {
      await disconnectAsync().catch(() => undefined);
      account = undefined;
    }
    if (!account) {
      if (!connector) throw new ApiError(0, "NO_WALLET", "Pick a wallet to continue");
      const res = await connectAsync({ connector, chainId: 8453 });
      account = res.accounts[0];
    }
    if (!account) throw new ApiError(0, "NO_WALLET", "Wallet didn't share an account");
    const { message } = await api.nonce(account);
    const signature = await signMessageAsync({ message, account });
    const out = await api.verify(message, signature);
    set(out);
    return out.session;
  }, [address, active, connectAsync, disconnectAsync, signMessageAsync, set]);

  const completeZeroG = useCallback(async (privyToken: string) => {
    const out = await api.signInZeroG(privyToken);
    set(out);
    return out.session;
  }, [set]);

  const signInDemo = useCallback(async () => {
    const out = await api.demo();
    set(out);
    return out;
  }, [set]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    await privyLogout().catch(() => undefined);
    await disconnectAsync().catch(() => undefined);
    set({ session: null, familiar: null });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  }, [disconnectAsync, set, qc]);

  const value = useMemo(
    () => ({ session, familiar, loading, refresh, signInWithWallet, signInDemo, completeZeroG, signOut }),
    [session, familiar, loading, refresh, signInWithWallet, signInDemo, completeZeroG, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}

export const zeroGEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
