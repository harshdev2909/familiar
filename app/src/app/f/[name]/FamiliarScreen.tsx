"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Pause, Volume2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Device, type DeviceMood } from "@/components/device/Device";
import { EnsPanel } from "@/components/familiar/EnsPanel";
import { FeedDialog } from "@/components/familiar/FeedDialog";
import { ForgetDialog } from "@/components/familiar/ForgetDialog";
import { Gallery } from "@/components/familiar/Gallery";
import { Meters } from "@/components/familiar/Meters";
import { Receipts } from "@/components/familiar/Receipts";
import { MicButton } from "@/components/MicButton";
import { InputModeToggle, TypeBox } from "@/components/TypeBox";
import { CarePanel } from "@/components/familiar/CarePanel";
import { DiaryCard } from "@/components/familiar/DiaryCard";
import { MeetCard } from "@/components/familiar/MeetCard";
import { PushToggle } from "@/components/familiar/PushToggle";
import { LanternNightNote, useLanternNight } from "@/components/events/LanternNight";
import { LanternSky } from "@/components/art/Lantern";
import { WalkCard, WalksStrip } from "@/components/walks/walks";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, isApiError, setVisitInput, type VisitInput } from "@/lib/api";
import type { FamiliarView, VisitView } from "@/lib/api-types";
import { ART, MASCOT, speciesArt } from "@/lib/art";
import { Mascot } from "@/components/art/Mascot";
import { Zzz } from "@/components/art/Doodles";
import { Diya } from "@/components/art/Diwali";
import { EmberIcon } from "@/components/art/Icons";
import { SpeechBubble, TulsiPlant } from "@/components/art/Handmade";
import Image from "next/image";
import Link from "next/link";
import { hms, useCountdown, useRecorder, useVisitPoll, useScrollToHash } from "@/lib/hooks";
import { useSession } from "@/lib/session";

type Phase = "idle" | "working" | "revealed";
const STAGES = ["Listening", "Remembering", "Painting", "Finding its voice"];

/** What it says the first time you drop by each day — one small beat of its own life. */
const HELLOS = [
  "You're back. I kept your spot warm.",
  "I counted the lights on your street today.",
  "Something smelled like chai earlier. Was that you?",
  "I practised a new sound while you were out.",
  "I watched the clouds and saved you the best one.",
  "The rain came by. I told it you'd be home soon.",
  "I tidied my corner. Mostly.",
];

/** A greeting on the first view of the (UTC) day, then quiet until tomorrow. Client-only. */
function useDailyHello(label: string) {
  const [hello] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(`familiar:hello:${label}`) === today) return null;
      const day = Math.floor(Date.now() / 86_400_000);
      return HELLOS[(day + label.length) % HELLOS.length]!;
    } catch {
      return null; // storage blocked: skip the greeting rather than repeat it
    }
  });
  useEffect(() => {
    if (!hello) return;
    try {
      localStorage.setItem(`familiar:hello:${label}`, new Date().toISOString().slice(0, 10));
    } catch {
      // ignore
    }
  }, [hello, label]);
  return hello;
}

export function FamiliarScreen({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const search = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { session, refresh: refreshSession } = useSession();
  const autoSubmit = useRef<((a: { blob: Blob; filename: string }) => void) | null>(null);
  const recorder = useRecorder({ onAutoStop: (a) => autoSubmit.current?.(a) });
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [current, setCurrent] = useState<VisitView | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [galleryKey, setGalleryKey] = useState(0);
  const [waking, setWaking] = useState(false);
  const lantern = useLanternNight();

  useScrollToHash();
  const fq = useQuery({ queryKey: ["familiar", name], queryFn: () => api.familiar(name), retry: (n, e) => !isApiError(e, "NOT_FOUND") && n < 2 });
  const familiar = fq.data?.familiar ?? null;
  const isOwner = Boolean(session && familiar && session.address.toLowerCase() === familiar.owner);

  const latestQ = useQuery({ queryKey: ["latest", name, galleryKey], queryFn: () => api.history(name, 1), enabled: isOwner });
  const latest = latestQ.data?.owner ? (latestQ.data.visits[0] ?? null) : null;
  const shown = current ?? latest;

  const onVisitUpdate = useCallback(
    (v: VisitView) => {
      if (v.status === "complete") void qc.invalidateQueries({ queryKey: ["ens", name] });
    },
    [qc, name],
  );
  const polled = useVisitPoll(current, onVisitUpdate);

  useEffect(() => {
    if (search.get("hatched") === "1" && familiar) toast(`Welcome, ${familiar.label}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familiar?.label]);

  useEffect(() => {
    if (phase !== "working") return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6500);
    return () => clearInterval(id);
  }, [phase]);

  const setFamiliar = (f: FamiliarView) => qc.setQueryData(["familiar", name], { familiar: f });

  const submit = async (input: VisitInput) => {
    setPhase("working");
    setStage(0);
    const form = setVisitInput(new FormData(), input);
    try {
      const r = await api.visit(name, form);
      setFamiliar(r.familiar);
      setCurrent(r.visit);
      setPhase("revealed");
      if (r.reward) toast(r.reward.leveledUp ? `Level ${r.reward.level}! +${r.reward.sparks} Sparks` : `+${r.reward.sparks} Sparks · +${r.reward.xp} XP`);
      setGalleryKey((k) => k + 1);
      void refreshSession();
      void qc.invalidateQueries({ queryKey: ["credits"] });
    } catch (e) {
      setPhase("idle");
      if (isApiError(e, "PAYMENT_REQUIRED") && session?.method === "wallet") setFeedOpen(true);
      if (isApiError(e, "UNAUTHENTICATED")) void refreshSession(); // expired session → header shows Sign in
      toast(isApiError(e) ? e.message : "That visit didn't go through — try again", "error");
      void fq.refetch();
    }
  };

  // eslint-disable-next-line react-hooks/refs -- kept in sync for the recorder's auto-stop callback
  autoSubmit.current = (audio) => void submit({ audio });

  const wake = async () => {
    setWaking(true);
    setPhase("working");
    setStage(1);
    try {
      const r = await api.wake(name);
      setFamiliar(r.familiar);
      setCurrent(r.visit);
      setPhase("revealed");
      setGalleryKey((k) => k + 1);
    } catch (e) {
      setPhase("idle");
      if (isApiError(e, "PAYMENT_REQUIRED") && session?.method === "wallet") setFeedOpen(true);
      toast(isApiError(e) ? e.message : "It didn't wake — try again", "error");
    } finally {
      setWaking(false);
    }
  };

  if (fq.isPending) return null; // Suspense skeleton covers first paint
  if (fq.isError || !familiar) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">
        <p className="text-2xl font-semibold tracking-tight">{isApiError(fq.error, "NOT_FOUND") ? `No one called ${name} lives here.` : "Couldn't reach your Familiar."}</p>
        <p className="text-muted-foreground">{isApiError(fq.error, "NOT_FOUND") ? "The name might still be free." : "Check your connection and try again."}</p>
        {isApiError(fq.error, "NOT_FOUND") ? <ButtonLink href="/hatch">Hatch {name}</ButtonLink> : <Button onClick={() => fq.refetch()}>Retry</Button>}
      </div>
    );
  }

  const portrait = current?.imageUrl ?? familiar.portraitUrl ?? (familiar.dormant ? ART.asleep : speciesArt(familiar.species));
  const mood: DeviceMood = familiar.dormant && phase !== "working" ? "asleep" : phase === "working" ? "thinking" : recorder.state === "recording" ? "listening" : "idle";

  return (
    <div className="bg-[image:var(--gradient-bg)]">
      {/* Phone: device → tonight → needs. Desktop: device + needs on the left, tonight on the right. */}
      <section className="mx-auto grid max-w-6xl gap-6 px-5 pb-12 pt-4 md:grid-cols-[1.1fr_1fr] md:grid-rows-[auto_1fr] md:gap-8 md:pt-10">
        <div className="relative mx-auto w-full max-w-[340px] md:col-start-1 md:row-start-1 md:max-w-[500px]">
        {lantern.live && !familiar.dormant && <LanternSky count={5} className="-left-4 -right-4 -top-4 bottom-1/3 md:-left-10 md:-right-10" />}
        {familiar.festival && !familiar.dormant && <Diya className="absolute bottom-[6%] left-[4%] z-10 size-14 drop-shadow-sm md:size-16" />}
        <Device
          image={portrait}
          mood={mood}
          level={recorder.level}
          label={`${familiar.label}, ${familiar.mood ?? "waiting"}`}
          className="aspect-square w-full"
        />
        </div>
        <div className="order-3 flex flex-col gap-5 md:order-none md:col-start-1 md:row-start-2">
          <LanternNightNote />
          {isOwner && <CarePanel familiar={familiar} onFamiliar={setFamiliar} />}
          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="mr-1 text-2xl font-semibold tracking-tight">{familiar.label}</h1>
              <Pill>{familiar.stage}</Pill>
              <Pill>night {familiar.day}</Pill>
              {familiar.mood && !familiar.dormant && <Pill tone="primary">{familiar.mood}</Pill>}
              {familiar.dormant && <Pill>asleep</Pill>}
            </div>
            <Meters familiar={familiar} method={isOwner ? (session?.method ?? null) : null} />
            {isOwner && (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold tabular-nums text-primary-foreground" aria-label={`Level ${familiar.level.level}`}>
                    {familiar.level.level}
                  </span>
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={familiar.level.levelSize} aria-valuenow={familiar.level.intoLevel}>
                      <div className="h-full rounded-full bg-[image:var(--gradient-accent)]" style={{ width: `${(familiar.level.intoLevel / familiar.level.levelSize) * 100}%` }} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{familiar.level.toNext} XP to level {familiar.level.level + 1}</p>
                  </div>
                  <Link href="/shop" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-wash px-3 text-sm font-medium tabular-nums text-primary">
                    <EmberIcon className="size-4" /> {familiar.sparks}
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {familiar.equipped.length ? (
                    familiar.equipped.map((e) => (
                      <span key={e.slot} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-3 text-xs">
                        <Image src={e.art} alt="" width={24} height={24} className="rounded-full" /> {e.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Wearing nothing yet.</span>
                  )}
                  <Link href="/shop" className="ml-auto text-xs text-primary underline-offset-4 hover:underline">Wardrobe</Link>
                </div>
                {!familiar.spunToday && (
                  <Link href="/quests" className="flex items-center gap-3 rounded-2xl bg-wash p-3 text-sm hover:bg-accent">
                    <Image src="/art/items/kandil.jpg" alt="" width={36} height={36} className="rounded-full" />
                    <span className="flex-1">Tonight&apos;s lantern is ready to spin</span>
                    <span className="text-primary">Spin</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tonight */}
        <div className="flex flex-col gap-5 md:col-start-2 md:row-span-2 md:row-start-1">
          {isOwner ? (
            <Tonight
              familiar={familiar}
              phase={phase}
              stage={stage}
              visit={polled ?? shown}
              fresh={phase === "revealed"}
              recorder={recorder}
              waking={waking}
              onRecorded={(audio) => void submit({ audio })}
              onTyped={(text) => void submit({ text })}
              onTooShort={() => toast("That was quick — hold a little longer", "error")}
              onWake={wake}
              onFeed={session?.method === "wallet" ? () => setFeedOpen(true) : undefined}
              onAgain={() => setPhase("idle")}
            />
          ) : (
            <PublicNote familiar={familiar} signedIn={Boolean(session)} />
          )}
          {shown && isOwner && <Receipts visit={polled ?? shown} />}
        </div>
      </section>

      {isOwner && (
        <section className="mx-auto grid max-w-6xl items-start gap-6 px-5 pb-12 md:grid-cols-[1.5fr_1fr]" aria-label="Diary and friends">
          <DiaryCard name={familiar.label} />
          <div className="flex flex-col gap-4">
            <MeetCard name={familiar.label} />
            <WalkCard />
            <PushToggle name={familiar.label} />
          </div>
        </section>
      )}

      <WalksStrip name={familiar.label} isOwner={isOwner} />

      <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 md:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-primary">Its name</h2>
          <EnsPanel name={familiar.label} />
          {isOwner && (
            <button onClick={() => setForgetOpen(true)} className="self-start rounded-full px-2 py-2 text-sm text-muted-foreground underline-offset-4 hover:text-destructive hover:underline">
              Forget {familiar.label}…
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="flex items-end gap-2 text-sm font-medium text-primary">
            Memories <TulsiPlant className="h-7" />
          </h2>
          <Gallery name={familiar.label} refreshKey={galleryKey} />
        </div>
      </section>

      <FeedDialog
        name={familiar.label}
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        onFed={(credits) => {
          setFamiliar({ ...familiar, feedCredits: credits });
          toast(`${familiar.label} is fed`);
        }}
      />
      <ForgetDialog name={familiar.label} open={forgetOpen} onClose={() => setForgetOpen(false)} />
    </div>
  );
}

function Tonight({
  familiar,
  phase,
  stage,
  visit,
  fresh,
  recorder,
  waking,
  onRecorded,
  onTyped,
  onTooShort,
  onWake,
  onFeed,
  onAgain,
}: {
  familiar: FamiliarView;
  phase: Phase;
  stage: number;
  visit: VisitView | null;
  fresh: boolean;
  recorder: ReturnType<typeof useRecorder>;
  waking: boolean;
  onRecorded: (a: { blob: Blob; filename: string }) => void;
  onTyped: (text: string) => void;
  onTooShort: () => void;
  onWake: () => void;
  onFeed?: () => void;
  onAgain: () => void;
}) {
  const untilRefresh = useCountdown(familiar.creditsRefreshAt);
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const noMic = recorder.state === "unsupported" || recorder.state === "denied";
  const typing = mode === "text" || noMic;
  const hungry = Boolean(onFeed) && familiar.feedCredits === 0 && !familiar.demo;
  const visitedForTonight = familiar.visitedToday && !familiar.demo;
  const hello = useDailyHello(familiar.label);

  if (phase === "working") {
    return (
      <Panel>
        <div className="flex items-center gap-4">
          <Mascot src={stage === 0 ? MASCOT.listening : MASCOT.thinking} size={64} />
          <p className="text-sm font-medium text-primary">Tonight</p>
        </div>
        <p className="text-3xl font-semibold tracking-tight">{familiar.label} is thinking about what you said.</p>
        <ol className="mt-2 grid gap-3" aria-live="polite">
          {STAGES.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-3 text-[15px] transition-opacity", i > stage && "opacity-40")}>
              {i < stage ? <Check className="size-4 text-success" aria-hidden /> : i === stage ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> : <span className="size-4 rounded-full ring-1 ring-border" />}
              {s}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">Usually 30–45 seconds. Every step runs on 0G and gets a receipt.</p>
      </Panel>
    );
  }

  if (familiar.dormant) {
    return (
      <Panel>
        <div className="flex items-center gap-3">
          <Mascot src={ART.asleep} size={64} />
          <Zzz className="text-soft" />
        </div>
        <p className="text-sm font-medium text-primary">Asleep</p>
        <p className="text-3xl font-semibold tracking-tight">{familiar.label} fell asleep waiting for you.</p>
        <p className="text-muted-foreground">It&apos;s been more than a week. Wake it up — same creature, same memories. Waking costs one visit.</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={onWake} loading={waking} disabled={hungry}>
            Wake {familiar.label}
          </Button>
          {onFeed && (
            <Button size="lg" variant="outline" onClick={onFeed}>
              Feed $1
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  if (visit && (fresh || visitedForTonight)) {
    return (
      <Panel>
        <p className="text-sm font-medium text-primary">{fresh ? "Just now" : "Tonight"}</p>
        <blockquote className="text-pretty text-[1.65rem] font-medium leading-snug tracking-[-0.015em]">“{visit.reply}”</blockquote>
        {visit.replyAudioUrl && <Voice src={visit.replyAudioUrl} autoPlay={fresh} />}
        <ChainStatus visit={visit} />
        {visit.video.status === "pending" && <p className="text-sm text-muted-foreground">It&apos;s growing. An evolution clip is on its way…</p>}
        {visit.video.url && <video src={visit.video.url} className="aspect-square w-full rounded-2xl" controls playsInline autoPlay muted loop aria-label="Evolution clip" />}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
          {visitedForTonight ? (
            <span>
              See you after midnight UTC — <span className="font-mono tabular-nums text-foreground">{untilRefresh === null ? "--:--:--" : hms(untilRefresh)}</span>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={onAgain}>Talk again</Button>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      {hello && !hungry ? (
        <div className="flex items-start gap-3">
          <Mascot src={familiar.portraitUrl ?? speciesArt(familiar.species)} size={64} className="animate-bob motion-reduce:animate-none" />
          <SpeechBubble tail="left" className="mt-1 animate-pop text-[15px] leading-snug">
            <span className="sr-only">{familiar.label} says: </span>
            {hello}
          </SpeechBubble>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Mascot src={hungry ? MASCOT.hungry : MASCOT.listening} size={64} />
          <p className="text-sm font-medium text-primary">Tonight</p>
        </div>
      )}
      <p className="text-3xl font-semibold tracking-tight">
        {hungry ? `${familiar.label} is hungry.` : `${familiar.label} hasn't heard from you tonight.`}
      </p>
      <p className="text-muted-foreground">
        {hungry
          ? "Feed it $1 to visit tonight, or sign in with 0G to use your daily credits."
          : typing
            ? "Write it a little note about your day. It'll answer in one line, and paint what it read."
            : "Tell it about your day. Up to a minute — it'll answer in one line, and paint what it heard."}
      </p>
      <div className="flex flex-col items-center gap-3 py-4">
        {hungry ? (
          <Button size="lg" onClick={onFeed}>Feed $1</Button>
        ) : typing ? (
          <TypeBox onSend={onTyped} label={`Tell ${familiar.label} about today`} autoFocus={mode === "text"} />
        ) : (
          <MicButton recorder={recorder} onRecorded={onRecorded} onTooShort={onTooShort} />
        )}
        {!hungry && !noMic && recorder.state !== "recording" && <InputModeToggle mode={mode} onChange={setMode} />}
      </div>
      {!hungry && onFeed && !familiar.demo && (
        <p className="text-center text-xs text-muted-foreground">
          {familiar.feedCredits} visit{familiar.feedCredits === 1 ? "" : "s"} saved ·{" "}
          <button onClick={onFeed} className="underline underline-offset-2 hover:text-foreground">feed more</button>
        </p>
      )}
    </Panel>
  );
}

function ChainStatus({ visit }: { visit: VisitView }) {
  const items = [
    { label: "Kept awake 7 more days", done: Boolean(visit.chain.renewTx), href: visit.chain.links.renew },
    { label: "Updated its name's avatar and mood", done: Boolean(visit.chain.recordsTx), href: visit.chain.links.records },
    { label: "Logged the night on 0G Chain", done: Boolean(visit.chain.logTx), href: visit.chain.links.log },
  ];
  const complete = visit.status === "complete";
  return (
    <ul className="grid gap-2 text-sm" aria-live="polite">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2.5">
          {i.done || complete ? <Check className="size-4 text-success" aria-hidden /> : <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          <span className={cn(!(i.done || complete) && "text-muted-foreground")}>{i.label}</span>
          {i.href && (
            <a href={i.href} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`${i.label} — view transaction`}>
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function Voice({ src, autoPlay }: { src: string; autoPlay: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (autoPlay) void ref.current?.play().catch(() => undefined);
  }, [autoPlay, src]);
  return (
    <div>
      <audio ref={ref} src={src} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} preload="auto" />
      <Button variant="secondary" size="sm" onClick={() => (playing ? ref.current?.pause() : void ref.current?.play())}>
        {playing ? <Pause className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        {playing ? "Pause" : "Hear it"}
      </Button>
    </div>
  );
}

function PublicNote({ familiar, signedIn }: { familiar: FamiliarView; signedIn: boolean }) {
  return (
    <Panel>
      <p className="text-sm font-medium text-primary">A Familiar</p>
      <p className="text-3xl font-semibold tracking-tight">
        {familiar.dormant ? `${familiar.label} is asleep.` : `${familiar.label} has been listening for ${familiar.day} night${familiar.day === 1 ? "" : "s"}.`}
      </p>
      <p className="text-muted-foreground">Only the person it&apos;s bonded to can talk with it. What they say stays between them.</p>
      {!signedIn && <ButtonLink href="/hatch" className="self-start">Hatch your own</ButtonLink>}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex animate-rise flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">{children}</div>;
}

