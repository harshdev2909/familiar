"use client";

import { Check, Copy, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { VisitView } from "@/lib/api-types";

const STEP: Record<string, string> = { transcribe: "Heard you", think: "Thought", draw: "Painted", speak: "Spoke", evolve: "Evolved" };

function CopyId({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-2 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(id);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      aria-label={`Copy request ID ${id}`}
    >
      <span className="truncate">{id}</span>
      {done ? <Check className="size-3 shrink-0" aria-hidden /> : <Copy className="size-3 shrink-0" aria-hidden />}
    </button>
  );
}

/** Every AI call behind a visit, with its 0G request ID, cost and TEE check. */
export function Receipts({ visit }: { visit: VisitView }) {
  const total = visit.receipts.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-sm marker:hidden hover:bg-accent/50">
        <span className="font-medium">Receipts</span>
        <span className="font-mono text-xs text-muted-foreground">
          {visit.receipts.length} calls · ${total.toFixed(4)}
        </span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {visit.receipts.map((r) => (
          <li key={r.requestId} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
            <span className="font-medium">{STEP[r.step] ?? r.step}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">{r.model}</span>
            <span className="flex items-center justify-end gap-2 font-mono text-xs text-muted-foreground">
              {r.teeVerified && (
                <span className="inline-flex items-center gap-1 text-success" title="Provider TEE signature verified by the 0G router">
                  <ShieldCheck className="size-3.5" aria-hidden /> TEE
                </span>
              )}
              {r.latencyMs >= 1000 ? `${(r.latencyMs / 1000).toFixed(1)}s` : `${r.latencyMs}ms`}
              {r.costUsd != null && ` · $${r.costUsd.toFixed(4)}`}
            </span>
            <span className="col-span-3 -ml-2">
              <CopyId id={r.requestId} />
            </span>
          </li>
        ))}
      </ul>
      {visit.requestIdsHash && (
        <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          The hash of these IDs{" "}
          {visit.chain.links.log ? (
            <a href={visit.chain.links.log} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              is logged on 0G Chain
            </a>
          ) : (
            "is being logged on 0G Chain"
          )}{" "}
          — <span className="font-mono">{visit.requestIdsHash.slice(0, 18)}…</span>
        </p>
      )}
    </details>
  );
}
