"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MapPin } from "lucide-react";
import Image from "next/image";
import { Diya } from "@/components/art/Diwali";
import { EmberIcon } from "@/components/art/Icons";
import { SkyLantern } from "@/components/art/Lantern";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { api } from "@/lib/api";
import type { EventView } from "@/lib/api-types";
import { useNow } from "@/lib/browser";

const DAY = 86_400_000;
const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const dayOf = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function dateRange(start: string, end: string) {
  const [a, b] = [new Date(dayOf(start)), new Date(dayOf(end))];
  if (start === end) return fmt.format(a);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${fmt.format(b)}`;
  return `${fmt.format(a)} – ${fmt.format(b)}`;
}

/** "Live now", "Starts tomorrow", "Starts in 3 days", "Ended". */
export function useEventStatus(e: EventView) {
  const now = useNow();
  if (e.status === "live") {
    const left = now === null ? null : Math.ceil((dayOf(e.end) + DAY - now) / DAY);
    return { tone: "live" as const, text: "Live now", sub: left === 1 ? "last day" : left ? `${left} days left` : null };
  }
  if (e.status === "upcoming") {
    const days = now === null ? null : Math.max(1, Math.ceil((dayOf(e.start) - now) / DAY));
    return { tone: "upcoming" as const, text: days === null ? "Coming up" : days === 1 ? "Starts tomorrow" : `Starts in ${days} days`, sub: null };
  }
  return { tone: "ended" as const, text: "Ended", sub: null };
}

export function StatusChip({ event, className }: { event: EventView; className?: string }) {
  const s = useEventStatus(event);
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        s.tone === "live" ? "bg-mint text-mint-ink" : s.tone === "upcoming" ? "bg-sky text-sky-ink" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {s.tone === "live" && (
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
          <span className="relative size-2 rounded-full bg-current" />
        </span>
      )}
      {s.text}
      {s.sub && <span className="font-normal opacity-80">· {s.sub}</span>}
    </span>
  );
}

/** The event's logo on a paper-white sticker, so dark and coloured wordmarks read in both themes. */
export function EventLogo({ event, size = "md" }: { event: EventView; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-9 px-2" : "h-12 px-3";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-2xl bg-white shadow-sticker", h)}>
      {event.logo ? (
        <Image src={event.logo} alt={`${event.name} logo`} width={120} height={40} unoptimized className={cn("w-auto object-contain", size === "sm" ? "h-5 max-w-20" : "h-7 max-w-32")} />
      ) : event.id === "lantern-night" ? (
        <SkyLantern className={size === "sm" ? "h-7" : "h-9"} />
      ) : (
        <Diya className={size === "sm" ? "size-7" : "size-9"} />
      )}
    </span>
  );
}

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function EventCard({ event }: { event: EventView }) {
  return (
    <li className="sticker flex flex-col overflow-hidden">
      <div className="relative aspect-[16/10] bg-peach">
        <Image src={event.art} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className={cn("object-cover", event.status === "ended" && "grayscale-[0.6]")} />
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <EventLogo event={event} />
          <StatusChip event={event} className="shadow-sticker" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{event.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {event.place} · {dateRange(event.start, event.end)}
          </p>
        </div>
        {event.blurb && <p className="text-[15px] leading-relaxed text-muted-foreground">{event.blurb}</p>}
        {event.bonus && (
          <p className="flex items-start gap-2 rounded-2xl bg-butter px-3 py-2 text-sm text-butter-ink">
            <EmberIcon className="mt-0.5 size-4 shrink-0" />
            <span>{event.bonus}</span>
          </p>
        )}
        {event.url && (
          <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex h-10 items-center gap-1 self-start rounded-full text-sm font-medium text-primary underline-offset-4 hover:underline">
            {host(event.url)} <ArrowUpRight className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  );
}

/** Home-page Spotlight: this week's events, with what they unlock in Familiar. */
export function Spotlight({ exclude = [] }: { exclude?: string[] }) {
  const q = useQuery({ queryKey: ["events"], queryFn: api.events, staleTime: 5 * 60_000 });
  const events = q.data?.events.filter((e) => !exclude.includes(e.id)) ?? [];
  if (q.isError || (q.data && events.length === 0)) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-12" aria-labelledby="spotlight">
      <h2 id="spotlight" className="text-sm font-medium text-primary">Spotlight</h2>
      <p className="mt-2 max-w-xl text-3xl font-semibold tracking-tight">This week in Mumbai.</p>
      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {q.isPending ? [0, 1].map((i) => <Skeleton key={i} className="aspect-[4/5] rounded-bubble" />) : events.map((e) => <EventCard key={e.id} event={e} />)}
      </ul>
    </section>
  );
}

/** Compact event strip for /quests. */
export function EventStrip({ className }: { className?: string }) {
  const q = useQuery({ queryKey: ["events"], queryFn: api.events, staleTime: 5 * 60_000 });
  const events = q.data?.events.filter((e) => e.status !== "ended") ?? [];
  if (q.isPending) return <Skeleton className={cn("h-16 rounded-bubble", className)} />;
  if (q.isError || events.length === 0) return null;
  return (
    <section aria-label="Events" className={cn("-mx-5 overflow-x-auto px-5 pb-2", className)}>
      <ul className="flex gap-3">
        {events.map((e) => (
          <li key={e.id} className="flex min-w-[17rem] max-w-sm flex-1 items-center gap-3 rounded-bubble border border-border bg-card p-3 shadow-soft">
            <EventLogo event={e} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold leading-tight">{e.name}</p>
                <StatusChip event={e} className="h-6 px-2 text-[11px]" />
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={e.bonus}>{e.bonus || `${e.place} · ${dateRange(e.start, e.end)}`}</p>
            </div>
            {e.url && (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`${e.name} website (opens in a new tab)`}>
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
