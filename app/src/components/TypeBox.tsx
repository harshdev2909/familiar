"use client";

import { ArrowUp } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";

export const TEXT_MAX = 1000;

/**
 * The typed alternative to the mic: a soft textarea with a counter. Enter sends, Shift+Enter adds a
 * line. Sends trimmed text (1–1000 characters).
 */
export function TypeBox({
  onSend,
  disabled,
  placeholder = "Today I…",
  label = "What happened today?",
  sendLabel = "Send",
  autoFocus = true,
  className,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  sendLabel?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const ok = trimmed.length >= 1 && trimmed.length <= TEXT_MAX;
  const send = () => ok && !disabled && onSend(trimmed);
  return (
    <form
      className={cn("flex w-full flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="rounded-bubble border border-border bg-card p-3 shadow-soft focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        <textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={4}
          maxLength={TEXT_MAX}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-describedby={`${id}-count`}
          className="block min-h-24 w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span id={`${id}-count`} className={cn("font-mono text-[11px] tabular-nums", text.length > TEXT_MAX - 80 ? "text-primary" : "text-muted-foreground")}>
            {text.length}/{TEXT_MAX}
          </span>
          <Button type="submit" size="sm" disabled={!ok || disabled}>
            {sendLabel} <ArrowUp className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </form>
  );
}

/** "Type instead" / "Talk instead" switch shown under the mic. */
export function InputModeToggle({ mode, onChange }: { mode: "voice" | "text"; onChange: (m: "voice" | "text") => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(mode === "voice" ? "text" : "voice")}
      className="inline-flex h-10 items-center rounded-full px-4 text-sm text-muted-foreground underline-offset-4 hover:bg-accent hover:text-foreground"
    >
      {mode === "voice" ? "Type instead" : "Talk instead"}
    </button>
  );
}
