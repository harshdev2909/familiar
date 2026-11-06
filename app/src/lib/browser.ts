"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => undefined;

/** Current time in ms, ticking every second (null during SSR/hydration). */
const clock = (() => {
  let now = Date.now();
  const subs = new Set<() => void>();
  let id: ReturnType<typeof setInterval> | undefined;
  return {
    subscribe(cb: () => void) {
      subs.add(cb);
      id ??= setInterval(() => {
        now = Date.now();
        subs.forEach((s) => s());
      }, 1000);
      return () => {
        subs.delete(cb);
        if (!subs.size && id) {
          clearInterval(id);
          id = undefined;
        }
      };
    },
    get: () => now,
  };
})();
export const useNow = () => useSyncExternalStore<number | null>(clock.subscribe, clock.get, () => null);

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

let webgl: boolean | undefined;
function detectWebGL() {
  if (webgl !== undefined) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}
/** null on the server, then whether WebGL is available. */
export const useWebGL = () => useSyncExternalStore<boolean | null>(noop, detectWebGL, () => null);

const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
export const useCanRecord = () => useSyncExternalStore(noop, canRecord, () => true);
