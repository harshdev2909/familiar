"use client";

import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import type { useRecorder } from "@/lib/hooks";
import { cn } from "./ui/cn";

type Recorder = ReturnType<typeof useRecorder>;
const MIN_MS = 1200;

/**
 * Hold to talk (release to send). A quick tap switches to tap-to-start / tap-to-stop, which is also
 * what Space/Enter do, so the button works with touch, mouse, keyboard and switch access.
 */
export function MicButton({
  recorder,
  onRecorded,
  onTooShort,
  disabled,
  idleLabel = "Hold to talk",
}: {
  recorder: Recorder;
  onRecorded: (audio: { blob: Blob; filename: string }) => void;
  onTooShort?: () => void;
  disabled?: boolean;
  idleLabel?: string;
}) {
  const { state, elapsed, start, stop, maxMs } = recorder;
  const pressedAt = useRef(0);
  const [toggleMode, setToggleMode] = useState(false);
  const recording = state === "recording";

  const finish = async () => {
    setToggleMode(false);
    const out = await stop();
    if (!out) return;
    if (out.ms < MIN_MS || out.blob.size < 2000) return onTooShort?.();
    onRecorded(out);
  };

  const progress = Math.min(1, elapsed / maxMs);
  const r = 46;
  const circ = 2 * Math.PI * r;
  const secondsLeft = Math.ceil((maxMs - elapsed) / 1000);

  const label =
    state === "denied"
      ? "Microphone blocked"
      : state === "unsupported"
        ? "Recording isn't supported in this browser"
        : state === "requesting"
          ? "Allow the microphone…"
          : recording
            ? toggleMode
              ? "Tap to send"
              : "Release to send"
            : idleLabel;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={disabled || state === "unsupported"}
        aria-pressed={recording}
        aria-label={recording ? `Recording, ${secondsLeft} seconds left. ${label}` : label}
        className={cn(
          "relative grid size-24 touch-none select-none place-items-center rounded-full transition-[transform,background-color] duration-200 ease-out-soft",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-40",
          recording ? "scale-105 bg-primary text-primary-foreground" : "bg-primary text-primary-foreground hover:scale-[1.03] active:scale-95",
        )}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (recording) return void finish();
          pressedAt.current = Date.now();
          void start();
        }}
        onPointerUp={() => {
          if (state === "requesting") return setToggleMode(true); // released while the permission prompt was open
          if (!recording) return;
          if (Date.now() - pressedAt.current < 350) {
            setToggleMode(true); // a tap: keep recording until the next tap
            return;
          }
          if (!toggleMode) void finish();
        }}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            if (recording) void finish();
            else {
              setToggleMode(true);
              void start();
            }
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity={recording ? 0.25 : 0} strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-200"
          />
        </svg>
        {recording ? <Square className="size-6 fill-current" aria-hidden /> : <Mic className="size-7" aria-hidden />}
        {recording && <span className="absolute -inset-2 -z-10 animate-ping rounded-full bg-primary/25 motion-reduce:hidden" aria-hidden />}
      </button>
      <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
        {recording ? (
          <span className="font-mono tabular-nums text-foreground">{`0:${String(Math.floor(elapsed / 1000)).padStart(2, "0")}`} / 1:00</span>
        ) : state === "denied" ? (
          "Allow microphone access in your browser settings, then try again"
        ) : (
          label
        )}
      </p>
    </div>
  );
}
