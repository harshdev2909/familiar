"use client";

import { hms, useSecondsToUtcMidnight } from "@/lib/hooks";

export function RefreshCountdown() {
  const s = useSecondsToUtcMidnight();
  return (
    <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/50 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      Tonight&apos;s AI credits expire in <span className="font-mono tabular-nums text-foreground">{s === null ? "--:--:--" : hms(s)}</span>
    </p>
  );
}
