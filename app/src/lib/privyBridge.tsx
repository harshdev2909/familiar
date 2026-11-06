"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";

/** Lets code outside Privy's tree (sign-out) end the 0G/Privy session too. */
let logoutFn: (() => Promise<void>) | null = null;
export const privyLogout = () => logoutFn?.() ?? Promise.resolve();

export function PrivyBridge() {
  const { logout, authenticated } = usePrivy();
  useEffect(() => {
    logoutFn = authenticated ? logout : null;
    return () => {
      logoutFn = null;
    };
  }, [logout, authenticated]);
  return null;
}
