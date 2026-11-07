"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { ApiError, api } from "./api";

/**
 * Web Push for "ping me when it's hungry": register /sw.js, subscribe with the server's VAPID key,
 * and keep the server's list of endpoints in step.
 */

export type PushSupport = "pending" | "supported" | "install" | "unsupported";

const noop = () => () => undefined;

function detect(): PushSupport {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iOS only offers Web Push to sites added to the Home Screen.
  if (ios && !standalone) return "install";
  return has ? "supported" : "unsupported";
}

export const usePushSupport = () => useSyncExternalStore<PushSupport>(noop, detect, () => "pending");

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export function usePush(enabled: boolean) {
  const qc = useQueryClient();
  const support = usePushSupport();
  const keyQ = useQuery({ queryKey: ["push-key"], queryFn: api.pushKey, enabled: enabled && (support === "supported" || support === "install"), staleTime: Infinity, retry: false });
  const key = keyQ.data?.key ?? null;
  const subQ = useQuery({
    queryKey: ["push-sub"],
    queryFn: async () => Boolean(await currentSubscription()) && Notification.permission === "granted",
    enabled: enabled && support === "supported" && Boolean(key),
    staleTime: Infinity,
  });

  const subscribe = useCallback(async () => {
    if (!key) throw new ApiError(0, "NOT_CONFIGURED", "Notifications aren't set up here yet");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new ApiError(0, permission === "denied" ? "DENIED" : "DISMISSED", "Notifications are off for this site");
    const reg = await registration();
    const wanted = keyBytes(key);
    let sub = await reg.pushManager.getSubscription();
    // Reuse an existing subscription only if it was made with today's server key (keys can rotate).
    if (sub && !sameKey(sub.options.applicationServerKey, wanted)) {
      await sub.unsubscribe().catch(() => undefined);
      sub = null;
    }
    try {
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
    } catch {
      // A stale subscription the browser wouldn't replace: drop it and subscribe afresh.
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
    }
    const json = sub.toJSON();
    if (!json.keys?.p256dh || !json.keys.auth) throw new ApiError(0, "INTERNAL", "This browser didn't hand over push keys");
    await api.pushSubscribe({ endpoint: sub.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    qc.setQueryData(["push-sub"], true);
  }, [key, qc]);

  const unsubscribe = useCallback(async () => {
    const sub = await currentSubscription();
    if (sub) {
      await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
    }
    qc.setQueryData(["push-sub"], false);
  }, [qc]);

  return {
    support,
    /** null while loading; false when the server has no VAPID key. */
    available: support === "pending" || support === "unsupported" ? false : keyQ.isPending ? null : Boolean(key),
    subscribed: subQ.data ?? false,
    checking: subQ.isPending && Boolean(key),
    subscribe,
    unsubscribe,
  };
}

/** Compare a subscription's applicationServerKey with the expected key bytes. */
function sameKey(have: ArrayBuffer | null, want: Uint8Array) {
  if (!have) return false;
  const a = new Uint8Array(have);
  return a.length === want.length && a.every((v, i) => v === want[i]);
}
