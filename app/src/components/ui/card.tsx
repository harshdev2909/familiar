import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border/80 bg-card text-card-foreground shadow-soft", className)} {...props} />;
}

export type PillTone = "muted" | "primary" | "success" | "blush" | "mint" | "butter" | "lilac" | "sky" | "peach";

export function Pill({ className, tone = "muted", ...props }: ComponentProps<"span"> & { tone?: PillTone }) {
  const tones: Record<PillTone, string> = {
    muted: "border-border text-muted-foreground",
    primary: "border-primary/25 bg-wash text-primary",
    success: "border-success/30 text-success",
    blush: "border-transparent bg-blush text-blush-ink",
    mint: "border-transparent bg-mint text-mint-ink",
    butter: "border-transparent bg-butter text-butter-ink",
    lilac: "border-transparent bg-lilac text-lilac-ink",
    sky: "border-transparent bg-sky text-sky-ink",
    peach: "border-transparent bg-peach text-peach-ink",
  };
  return <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium", tones[tone], className)} {...props} />;
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} aria-hidden {...props} />;
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd className={cn("rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground", className)} {...props} />;
}
