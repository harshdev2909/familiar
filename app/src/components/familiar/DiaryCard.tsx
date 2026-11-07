"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import { useState } from "react";
import { ScribbleUnderline, WashiTape } from "@/components/art/Handmade";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { DiaryResult } from "@/lib/api-types";
import { ROUND4 } from "@/lib/art";
import { useNow } from "@/lib/browser";
import { isoWeek, shiftWeek, weekDates, weekRange } from "@/lib/week";

export const DIARY_ART = ROUND4.diary;

/** A pastel per mood (the server's mood words), for the dots along the bottom of the page. */
const MOOD_DOT: Record<string, string> = {
  joyful: "bg-butter-ink",
  calm: "bg-mint-ink",
  tired: "bg-lilac-ink",
  anxious: "bg-peach-ink",
  proud: "bg-blush-ink",
  sad: "bg-sky-ink",
  curious: "bg-primary",
};
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Owner-only: the Familiar's weekly diary, in its own voice, one week at a time. */
export function DiaryCard({ name }: { name: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow();
  const current = now === null ? null : isoWeek(new Date(now));
  const [picked, setPicked] = useState<string | null>(null);
  const week = picked ?? current;
  const key = ["diary", name, picked ?? "current"] as const;
  const q = useQuery({ queryKey: key, queryFn: () => api.diary(name, picked ?? undefined), retry: (n, e) => !isApiError(e, "NOT_FOUND") && n < 1 });
  const shown = q.data?.diary?.week ?? week;
  const isCurrent = !picked || picked === current;

  const write = useMutation({
    mutationFn: () => api.writeDiary(name, picked ?? undefined),
    onSuccess: (r) => {
      qc.setQueryData<DiaryResult>(key, { diary: r.diary, canWrite: false });
      void qc.invalidateQueries({ queryKey: ["diary", name] });
      toast(isCurrent ? "Written. Don't read it all at once." : "Written. Some weeks deserve a record.");
    },
    onError: (e) => {
      if (isApiError(e, "NOTHING_TO_WRITE")) toast(`Nothing to write about yet. Visit ${name} first — it needs material.`, "error");
      else if (isApiError(e, "COOLDOWN") || isApiError(e, "RATE_LIMITED")) toast("One draft a day. Artists need rest.", "error");
      else toast(isApiError(e) ? e.message : "The pen ran dry. Try again?", "error");
    },
  });

  const go = (by: number) => shown && setPicked(shiftWeek(shown, by));
  const diary = q.data?.diary ?? null;
  const canWrite = q.data?.canWrite ?? false;
  const days = diary ? weekDates(diary.week).map((date, i) => ({ date, day: DAY_NAMES[i]!, mood: diary.days.find((d) => d.date === date)?.mood ?? null })) : [];

  return (
    <section id="diary" className="sticker flex scroll-mt-24 flex-col overflow-hidden" aria-labelledby="diary-title">
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        <Mascot src={DIARY_ART} size={48} />
        <div className="min-w-0 flex-1">
          <h2 id="diary-title" className="font-semibold tracking-tight">
            {name}&apos;s diary
          </h2>
          <p className="font-mono text-xs text-muted-foreground">{shown ? `${isCurrent ? "This week" : shown} · ${weekRange(shown)}` : "This week"}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(-1)} disabled={!shown} className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" aria-label="Previous week">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={() => go(1)} disabled={!shown || isCurrent} className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" aria-label="Next week">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* The page: ruled paper, a strip of tape, words in its own voice. */}
      <div className="relative mx-3 mb-3 rounded-[1.25rem] bg-paper px-5 pb-5 pt-7 ring-1 ring-border/70 sm:px-7">
        <WashiTape tone="lilac" className="absolute -top-2.5 left-6 -rotate-3" />
        <div aria-live="polite" aria-busy={q.isPending || write.isPending}>
          {q.isPending ? (
            <div className="flex flex-col gap-3 py-1">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : q.isError ? (
            <p className="py-2 text-[15px] leading-7 text-muted-foreground">
              {isApiError(q.error, "NOT_FOUND") ? "The diary's still at the bindery. Check back soon." : "Couldn't open the diary just now."}
            </p>
          ) : diary ? (
            <article className="animate-rise">
              {diary.moodLine && (
                <p className="relative inline-block text-lg font-semibold leading-7 tracking-tight">
                  {diary.moodLine}
                  <ScribbleUnderline className="absolute inset-x-0 -bottom-1 h-2.5" />
                </p>
              )}
              <p className="mt-3 whitespace-pre-line bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,var(--border)_27px,var(--border)_28px)] text-[16.5px] leading-7 text-pretty">
                {diary.text}
              </p>
              <p className="mt-2 text-right text-[15px] italic text-muted-foreground">— {name}</p>
            </article>
          ) : (
            <div className="flex flex-col gap-1 py-1">
              <p className="text-lg font-semibold leading-7 tracking-tight">{canWrite ? "Blank page. Suspicious." : "Nothing on this page."}</p>
              <p className="text-[15px] leading-7 text-muted-foreground">
                {canWrite
                  ? `${name} has opinions about this week. Let it write them down.`
                  : isCurrent
                    ? `Visit ${name} this week and it'll have something to say. It always does.`
                    : "We didn't talk that week, so neither did the diary."}
              </p>
            </div>
          )}
        </div>

        {days.length > 0 && (
          <ul className="mt-5 grid grid-cols-7 gap-1 border-t border-dashed border-border pt-3" aria-label="Moods this week">
            {days.map((d) => (
              <li key={d.date} className="flex flex-col items-center gap-1.5">
                <span className="font-mono text-[11px] text-muted-foreground" aria-hidden>
                  {d.day[0]}
                </span>
                <span
                  className={cn("size-3.5 rounded-full", d.mood ? (MOOD_DOT[d.mood] ?? "bg-foreground/50") : "ring-1 ring-inset ring-border")}
                  title={d.mood ? `${d.day}: ${d.mood}` : `${d.day}: no visit`}
                  aria-hidden
                />
                <span className="sr-only">
                  {d.day}: {d.mood ?? "no visit"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
          <Button onClick={() => write.mutate()} loading={write.isPending}>
            <PenLine className="size-4" aria-hidden /> {diary ? "Rewrite it" : isCurrent ? "Write this week" : "Write that week"}
          </Button>
          {write.isPending && <span className="text-sm text-muted-foreground">Choosing its words very carefully…</span>}
        </div>
      )}
    </section>
  );
}
