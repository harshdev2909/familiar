"use client";

import { useQuery } from "@tanstack/react-query";
import { QrCode, RefreshCw } from "lucide-react";
import Image from "next/image";
import { create } from "qrcode";
import { useMemo, useState } from "react";
import { Mascot } from "@/components/art/Mascot";
import { ShareLink } from "@/components/ShareLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, isApiError } from "@/lib/api";
import { ROUND4 } from "@/lib/art";
import { hms, useCountdown } from "@/lib/hooks";

export const MEET_ART = ROUND4.meet;

/** A QR code drawn as one SVG path: crisp at any size, no canvas, no innerHTML. */
export function QrSvg({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, d } = useMemo(() => {
    const qr = create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let path = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) path += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { size: n + 4, d: path };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={label} shapeRendering="crispEdges">
      {/* Always dark-on-white: scanners want contrast, whatever the theme. */}
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#1a1413" />
    </svg>
  );
}

/** Owner-only card: "Met someone?" → a sheet with today's meet code as a QR. */
export function MeetCard({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div id="meet" className="sticker flex scroll-mt-24 items-center gap-4 p-4">
      <Mascot src={MEET_ART} size={64} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold tracking-tight">Met a keeper IRL?</p>
        <p className="text-sm text-muted-foreground">Let them scan me. In person counts triple.</p>
      </div>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" className="shrink-0">
        <QrCode className="size-4" aria-hidden /> Meet code
      </Button>
      <MeetDialog name={name} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function MeetDialog({ name, open, onClose }: { name: string; open: boolean; onClose: () => void }) {
  const q = useQuery({ queryKey: ["meet-code", name], queryFn: () => api.meetCode(name), enabled: open, staleTime: 5 * 60_000, retry: 1 });
  const left = useCountdown(q.data?.expiresAt);
  // Past midnight UTC the code has rotated: fetch the new one.
  const stale = left === 0 && !q.isFetching;
  return (
    <Dialog open={open} onClose={onClose} title="Scan to meet" description={`Another keeper scans this to add ${name} to their Dex. You both get 3× Sparks.`}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative aspect-square w-full max-w-[17rem] overflow-hidden rounded-3xl bg-white p-3 shadow-sticker">
          {q.data && !stale ? (
            <QrSvg value={q.data.url} label={`QR code to meet ${name}`} className="size-full" />
          ) : q.isError ? (
            <div className="grid size-full place-items-center p-4 text-center">
              <div className="flex flex-col items-center gap-3 text-[#1a1413]">
                <Image src={MEET_ART} alt="" width={72} height={72} className="rounded-full bg-[#f5f1ea]" />
                <p className="text-sm">{isApiError(q.error, "NOT_FOUND") ? "Meet codes aren't open yet. Soon." : "The code got shy. Try again?"}</p>
              </div>
            </div>
          ) : (
            <Skeleton className="size-full rounded-2xl bg-[#efeae2]" />
          )}
        </div>
        {q.data && !stale ? (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Fresh until midnight UTC · <span className="font-mono tabular-nums text-foreground">{left === null ? "--:--:--" : hms(left)}</span>
            </p>
            <ShareLink url={q.data.url} title={`Meet ${name}`} text={`We met! Tap to add ${name} to your Dex.`} className="justify-center" />
            <p className="max-w-xs text-center text-xs text-muted-foreground">Works once per keeper. Screenshots go stale at midnight, like Cinderella.</p>
          </>
        ) : (
          (q.isError || stale) && (
            <Button variant="outline" onClick={() => void q.refetch()} loading={q.isFetching}>
              <RefreshCw className="size-4" aria-hidden /> {stale ? "Get today's code" : "Try again"}
            </Button>
          )
        )}
      </div>
    </Dialog>
  );
}
