"use client";

import { BellRing, Share } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import { ROUND4 } from "@/lib/art";
import { usePush } from "@/lib/push";

export const PING_ART = ROUND4.hungryPing;

const noop = () => () => undefined;
const useBlocked = () => useSyncExternalStore(noop, () => typeof Notification !== "undefined" && Notification.permission === "denied", () => false);

/**
 * "Ping me when it's hungry": a switch that subscribes this device to Web Push, plus a test button.
 * Hidden when the server has no VAPID key or the browser can't do push; on iOS outside the Home
 * Screen app it explains how to get there instead.
 */
export function PushToggle({ name }: { name: string }) {
  const toast = useToast();
  const push = usePush(true);
  const blockedAtStart = useBlocked();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [blocked, setBlocked] = useState(false);

  if (push.support === "pending" || push.support === "unsupported" || push.available === false) return null;

  const on = push.subscribed;
  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await push.unsubscribe();
        toast(`Fine. ${name} will suffer in silence.`);
      } else {
        await push.subscribe();
        toast(`Deal. ${name} will only ping when it matters. Probably.`);
      }
    } catch (e) {
      if (isApiError(e, "DENIED")) setBlocked(true);
      else if (!isApiError(e, "DISMISSED")) toast(isApiError(e) ? e.message : "That didn't stick. Try again?", "error");
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      const r = await api.pushTest();
      toast(r.sent ? "Sent. Check your notifications." : "Nothing to send to. Turn pings off and on again?", r.sent ? "default" : "error");
    } catch (e) {
      toast(isApiError(e) ? e.message : "The test ping got lost", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="sticker flex flex-col gap-3 p-4">
      <div className="flex items-center gap-4">
        <Mascot src={PING_ART} size={64} />
        <div className="min-w-0 flex-1">
          <p id="ping-label" className="font-semibold tracking-tight">
            Ping me when it&apos;s hungry
          </p>
          <p className="text-sm text-muted-foreground">{on ? "On. Expect the occasional dramatic sigh." : "At most twice a day. It has standards."}</p>
        </div>
        {push.support === "supported" && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="ping-label"
            disabled={busy || push.checking || push.available === null || blocked || blockedAtStart}
            onClick={() => void toggle()}
            className={cn(
              "relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ease-out-soft disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              "before:absolute before:-inset-1 before:content-['']", // ≥40px hit area
              on ? "bg-primary" : "bg-muted ring-1 ring-inset ring-border",
            )}
          >
            <span className={cn("absolute top-1 left-1 size-6 rounded-full bg-card shadow-sticker transition-transform duration-200 ease-out-soft", on && "translate-x-6")} />
          </button>
        )}
      </div>
      {push.support === "install" && (
        <p className="flex items-start gap-2 rounded-2xl bg-sky px-3 py-2 text-xs leading-relaxed text-sky-ink">
          <Share className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          On iPhone, pings need the app on your Home Screen: tap Share, then “Add to Home Screen”, and open it from there.
        </p>
      )}
      {(blocked || blockedAtStart) && (
        <p className="rounded-2xl bg-peach px-3 py-2 text-xs leading-relaxed text-peach-ink">Notifications are blocked for this site. Allow them in your browser settings, then come back.</p>
      )}
      {on && (
        <Button variant="ghost" size="sm" onClick={() => void test()} loading={testing} className="h-10 self-start">
          <BellRing className="size-4" aria-hidden /> Send a test
        </Button>
      )}
    </div>
  );
}
