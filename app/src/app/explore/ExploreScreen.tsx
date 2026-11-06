"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StarCharm } from "@/components/art/Charm";
import { AutoRickshaw, Cloud, MapPin } from "@/components/art/Handmade";
import { Avatar } from "@/components/explore/Avatar";
import { SpotSheet } from "@/components/explore/SpotSheet";
import { SignInDialog } from "@/components/SignIn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { ExploreFamiliar } from "@/lib/api-types";
import { speciesName } from "@/lib/art";
import { useSession } from "@/lib/session";

export function ExploreScreen() {
  const { session, familiar: mine, loading } = useSession();
  const router = useRouter();
  const toast = useToast();
  const q = useQuery({ queryKey: ["explore", session?.address ?? null], queryFn: api.explore, enabled: !loading, refetchInterval: 60_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // On phones the map is wider than the screen: start in the middle of town.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  const list = q.data?.familiars ?? [];
  const current = list.find((f) => f.label === selected) ?? null;
  const spottedCount = list.filter((f) => f.spotted).length;
  const canAct = Boolean(session && mine);
  const needAccount = () => {
    setOpen(false);
    if (!session) setSignIn(true);
    else {
      toast("Hatch a Familiar first — then you can spot others");
      router.push("/hatch");
    }
  };
  const show = (f: ExploreFamiliar) => {
    setSelected(f.label);
    setOpen(true);
  };

  return (
    <div className="pb-24">
      <section className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 md:pt-10">
        <Cloud drift className="absolute right-[38%] top-4 hidden h-9 lg:block" />
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <MapPin className="h-5" /> Explore
          </p>
          <h1 className="mt-1 text-balance text-4xl font-semibold tracking-tight">Who&apos;s out tonight?</h1>
          <p className="mt-2 max-w-md text-muted-foreground">Familiars whose keepers visited lately. Tap one to say hi, spot it for your Dex, or leave a little gift.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {q.data && <Pill tone="sky">{list.length} awake</Pill>}
          {canAct && q.data && (
            <Link href="/dex" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-mint px-4 text-sm font-medium text-mint-ink hover:brightness-[0.97]">
              <Check className="size-4" aria-hidden /> {spottedCount} spotted · Dex
            </Link>
          )}
        </div>
      </section>

      {/* The map */}
      <section aria-label="Map of nearby Familiars" className="relative mx-auto max-w-[1400px] md:px-5">
        <div ref={scroller} className="overflow-x-auto overscroll-x-contain md:overflow-visible">
          <div className="relative aspect-[3/2] w-full min-w-[760px] overflow-hidden bg-[oklch(0.93_0.04_80)] md:min-w-0 md:rounded-blob md:shadow-sticker">
            <Image src="/art/explore/map.jpg" alt="" fill priority sizes="(min-width: 1400px) 1360px, (min-width: 768px) 100vw, 760px" className="object-cover" />
            {list.map((f, i) => (
              <Pin key={f.label} f={f} index={i} onOpen={() => show(f)} />
            ))}
          </div>
        </div>

        {/* States, floated over the map */}
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-5">
          {(q.isPending || loading) && (
            <span className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full bg-card px-4 text-sm shadow-sticker">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Looking around…
            </span>
          )}
        </div>
        {(q.isError || (q.data && list.length === 0)) && (
          <div className="absolute inset-0 grid place-items-center p-5">
            <div className="sticker flex max-w-sm animate-rise flex-col items-center gap-3 p-6 text-center">
              <span className="relative">
                <span className="relative block size-28 overflow-hidden rounded-full bg-paper">
                  <Image src="/art/explore/catch.jpg" alt="" fill sizes="112px" className="object-cover" />
                </span>
                {!q.isError && <AutoRickshaw className="absolute -bottom-1 -right-14 h-9" />}
              </span>
              {q.isError ? (
                <>
                  <p className="text-lg font-semibold tracking-tight">The map didn&apos;t load.</p>
                  <p className="text-sm text-muted-foreground">Check your connection and look again.</p>
                  <Button onClick={() => q.refetch()}>Look again</Button>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold tracking-tight">Nobody&apos;s out yet.</p>
                  <p className="text-sm text-muted-foreground">Familiars show up here after their keepers visit. Yours could be the first.</p>
                  {mine ? <ButtonLink href={`/f/${mine.label}`}>Visit {mine.label}</ButtonLink> : <ButtonLink href="/hatch">Hatch yours</ButtonLink>}
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Signed-out / no Familiar call to action */}
      {!loading && !canAct && (
        <section className="mx-auto mt-6 max-w-6xl px-5">
          <div className="flex flex-col items-start gap-4 rounded-blob bg-butter p-6 text-butter-ink sm:flex-row sm:items-center">
            <StarCharm className="h-14 w-12 shrink-0 animate-bob motion-reduce:animate-none" />
            <div className="flex-1">
              <p className="text-lg font-semibold tracking-tight text-foreground">{session ? "Hatch a Familiar to start spotting." : "Sign in to spot them."}</p>
              <p className="text-sm text-foreground/75">Each new friend you spot earns Sparks. A new kind earns extra.</p>
            </div>
            {session ? <ButtonLink href="/hatch">Hatch yours</ButtonLink> : <Button onClick={() => setSignIn(true)}>Sign in</Button>}
          </div>
        </section>
      )}

      {/* The same Familiars as a list — easier on small screens and keyboards */}
      <section className="mx-auto mt-10 max-w-6xl px-5" aria-labelledby="nearby">
        <h2 id="nearby" className="text-sm font-medium text-primary">Nearby</h2>
        {q.isPending ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-bubble" />
            ))}
          </div>
        ) : list.length ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...list]
              .sort((a, b) => Number(a.spotted || a.mine) - Number(b.spotted || b.mine))
              .map((f) => (
                <li key={f.label}>
                  <button onClick={() => show(f)} className="squish flex w-full items-center gap-3 rounded-bubble border border-border bg-card p-3 text-left shadow-soft hover:bg-accent">
                    <Avatar species={f.species} portraitUrl={f.portraitUrl} size={48} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{f.label}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        Lv {f.level} {speciesName(f.species).toLowerCase()}
                        {f.mood ? ` · ${f.mood}` : ""}
                      </span>
                    </span>
                    {f.mine ? (
                      <Pill tone="primary">you</Pill>
                    ) : f.spotted ? (
                      <Pill tone="mint">
                        <Check className="size-3.5" aria-hidden /> spotted
                      </Pill>
                    ) : (
                      <Pill tone="butter">new</Pill>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            {!q.isError && <Cloud className="h-6" />}
            {q.isError ? "Couldn't look around just now." : "Quiet tonight."}
          </p>
        )}
      </section>

      {current && <SpotSheet key={current.label} familiar={current} open={open} onClose={() => setOpen(false)} canAct={canAct} onNeedAccount={needAccount} />}
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}

function Pin({ f, index, onOpen }: { f: ExploreFamiliar; index: number; onOpen: () => void }) {
  // Pins hang from their point, so keep the whole pin (≈ 90 px tall) inside the map.
  const x = 0.04 + Math.min(1, Math.max(0, f.pin.x)) * 0.92;
  const y = 0.2 + Math.min(1, Math.max(0, f.pin.y)) * 0.76;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group absolute -translate-x-1/2 -translate-y-full rounded-full focus-visible:outline-offset-4"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, zIndex: Math.round(y * 100) }}
      aria-label={`${f.label}, level ${f.level} ${speciesName(f.species).toLowerCase()}${f.mine ? ", that's you" : f.spotted ? ", spotted" : ", not spotted yet"}`}
    >
      <span className="flex animate-bob flex-col items-center motion-reduce:animate-none" style={{ animationDelay: `${(index % 6) * 0.45}s` }}>
        <span className="relative transition-transform duration-200 ease-out-soft group-hover:-translate-y-1 group-hover:scale-105 group-active:scale-95">
          <Avatar species={f.species} portraitUrl={f.portraitUrl} size={f.mine ? 60 : 52} />
          {f.spotted && !f.mine && (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-mint text-mint-ink shadow-sticker" aria-hidden>
              <Check className="size-3" strokeWidth={3} />
            </span>
          )}
        </span>
        {/* tail */}
        <span className="-mt-1 size-2.5 rotate-45 rounded-[2px] bg-card shadow-[1px_1px_0_oklch(0.2_0.01_30/0.12)]" aria-hidden />
        <span
          className={cn(
            "mt-1 max-w-28 truncate rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sticker",
            f.mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
          )}
        >
          {f.mine ? "you" : f.label}
        </span>
      </span>
    </button>
  );
}
