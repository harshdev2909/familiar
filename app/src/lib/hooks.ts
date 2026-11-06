"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useCanRecord, useNow } from "./browser";
import type { VisitView } from "./api-types";

/** Seconds until `target` (ISO), ticking every second. */
export function useCountdown(target: string | null | undefined) {
  const now = useNow();
  if (!target || now === null) return null;
  return Math.max(0, Math.floor((Date.parse(target) - now) / 1000));
}

/** Seconds until the next 00:00 UTC (null until the client clock is available). */
export function useSecondsToUtcMidnight() {
  const now = useNow();
  if (now === null) return null;
  const d = new Date(now);
  return Math.max(0, Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000));
}

/** Next 00:00 UTC — when daily 0G credits refresh. */
export function nextUtcMidnight() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

export const hms = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

export function humanDuration(s: number) {
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.max(1, Math.floor(s / 60))}m`;
}

// Prefer mp4/AAC (confirmed with 0G's Whisper); fall back to webm/opus.
const MIME_PREFS = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

export type RecorderState = "idle" | "requesting" | "recording" | "denied" | "unsupported";

/**
 * Voice recorder with a live input level (0..1, in a ref so 3D can read it every frame without
 * re-rendering). Stops automatically at `maxMs`.
 */
export function useRecorder({ maxMs = 60_000, onAutoStop }: { maxMs?: number; onAutoStop?: (out: { blob: Blob; filename: string; ms: number }) => void } = {}) {
  const autoStop = useRef(onAutoStop);
  useEffect(() => {
    autoStop.current = onAutoStop;
  }, [onAutoStop]);
  const [rawState, setState] = useState<RecorderState>("idle");
  const supported = useCanRecord();
  const state: RecorderState = supported ? rawState : "unsupported";
  const [elapsed, setElapsed] = useState(0);
  const level = useRef(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const stopResolve = useRef<((b: { blob: Blob; filename: string; ms: number } | null) => void) | null>(null);
  const cleanup = useRef<() => void>(() => undefined);

  useEffect(() => () => cleanup.current(), []);

  const start = useCallback(async () => {
    if (rec.current) return;
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState("denied");
      return;
    }
    const mimeType = MIME_PREFS.find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      level.current = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      setElapsed(Date.now() - started.current);
      if (Date.now() - started.current >= maxMs && r.state === "recording") r.stop();
      raf = requestAnimationFrame(tick);
    };

    cleanup.current = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => undefined);
      level.current = 0;
      rec.current = null;
    };
    r.onstop = () => {
      const ms = Date.now() - started.current;
      const type = r.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks.current, { type: type.split(";")[0] });
      cleanup.current();
      setState("idle");
      setElapsed(0);
      const out = { blob, filename: `voice.${type.includes("mp4") ? "m4a" : "webm"}`, ms };
      // A manual stop is awaiting this; an automatic stop at the time limit goes to onAutoStop.
      if (stopResolve.current) stopResolve.current(out);
      else autoStop.current?.(out);
      stopResolve.current = null;
    };
    rec.current = r;
    started.current = Date.now();
    r.start(250);
    raf = requestAnimationFrame(tick);
    setState("recording");
  }, [maxMs]);

  /** Stop and resolve with the recording (null if nothing was recording). */
  const stop = useCallback(
    () =>
      new Promise<{ blob: Blob; filename: string; ms: number } | null>((resolve) => {
        const r = rec.current;
        if (!r || r.state !== "recording") return resolve(null);
        stopResolve.current = resolve;
        r.stop();
      }),
    [],
  );

  return { state, elapsed, level, start, stop, maxMs };
}

/** Poll a visit until its onchain writes complete (and the evolution clip, if any, settles). */
export function useVisitPoll(initial: VisitView | null, onUpdate?: (v: VisitView) => void) {
  const [polled, setVisit] = useState<VisitView | null>(null);
  // The latest poll result for the current visit, else the visit as handed to us.
  const visit = polled && initial && polled.id === initial.id ? polled : initial;
  useEffect(() => {
    if (!visit) return;
    const settled = visit.status === "complete" && visit.video.status !== "pending";
    if (settled) return;
    const id = setTimeout(async () => {
      try {
        const r = await api.pollVisit(visit.id);
        setVisit(r.visit);
        onUpdate?.(r.visit);
      } catch {
        /* retry on next tick */
      }
    }, visit.status === "complete" ? 8000 : 3500);
    return () => clearTimeout(id);
  }, [visit, onUpdate]);
  return visit;
}
