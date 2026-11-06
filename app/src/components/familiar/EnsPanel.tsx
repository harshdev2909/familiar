"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Lock, ShieldX } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import type { AgentOverreachResult } from "@/lib/api-types";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/card";

/** Its name, resolved live — and proof the agent can only touch what it's allowed to. */
export function EnsPanel({ name }: { name: string }) {
  const q = useQuery({ queryKey: ["ens", name], queryFn: () => api.ens(name) });
  const [probe, setProbe] = useState<AgentOverreachResult | null>(null);
  const [probing, setProbing] = useState(false);

  if (q.isPending) return <Skeleton className="h-56" />;
  if (q.isError)
    return (
      <div className="flex items-center justify-between rounded-2xl border border-border p-5 text-sm">
        <span className="text-muted-foreground">Couldn&apos;t reach the name registry.</span>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>Retry</Button>
      </div>
    );
  const ens = q.data.ens;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-base font-medium">{ens.name}</p>
        {ens.resolver && (
          <a href={ens.explorer.resolver ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            resolver <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
      {ens.dormant ? (
        <p className="text-sm text-muted-foreground">Asleep. The name stops resolving until it wakes.</p>
      ) : (
        <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-2 text-sm">
          {(["avatar", "mood", "day"] as const).map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-mono text-xs leading-5">{ens.records[k] ?? "—"}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">expires</dt>
          <dd className="font-mono text-xs leading-5">{ens.expiresAt ? new Date(ens.expiresAt).toLocaleString() : "—"}</dd>
        </dl>
      )}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Its agent may update only its avatar, mood and day. Nothing else, ever.
        </p>
        {!ens.dormant && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            loading={probing}
            onClick={async () => {
              setProbing(true);
              try {
                setProbe(await api.overreach(name));
              } finally {
                setProbing(false);
              }
            }}
          >
            Let the agent try to overstep
          </Button>
        )}
        {probe && (
          <ul className="grid gap-1.5 text-xs" aria-live="polite">
            {probe.attempts.map((a) => (
              <li key={a.call} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                <span className="truncate font-mono">{a.call}</span>
                {a.reverted ? (
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-destructive">
                    <ShieldX className="size-3.5" aria-hidden /> refused
                  </span>
                ) : (
                  <span className="shrink-0 font-medium text-success">allowed</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
