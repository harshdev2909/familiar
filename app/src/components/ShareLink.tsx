"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";

const noop = () => () => undefined;
const useCanShare = () => useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

/** Copy a link (with a tick for a moment) and, where the platform has one, open the share sheet. */
export function ShareLink({ url, title, text, className, copyLabel = "Copy link" }: { url: string; title: string; text?: string; className?: string; copyLabel?: string }) {
  const toast = useToast();
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast("Couldn't copy. Long-press the link instead.", "error");
    }
  };
  const share = () => navigator.share({ title, text, url }).catch(() => undefined);
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button variant="outline" onClick={() => void copy()} aria-live="polite">
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied" : copyLabel}
      </Button>
      {canShare && (
        <Button variant="secondary" onClick={() => void share()}>
          <Share2 className="size-4" aria-hidden /> Share
        </Button>
      )}
    </div>
  );
}
