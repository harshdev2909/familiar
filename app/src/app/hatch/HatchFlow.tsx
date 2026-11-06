"use client";

import { ArrowLeft, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Device } from "@/components/device/Device";
import { MicButton } from "@/components/MicButton";
import { InputModeToggle, TypeBox } from "@/components/TypeBox";
import { SignInDialog } from "@/components/SignIn";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { ART, SPECIES, type SpeciesId } from "@/lib/art";
import { api, isApiError, setVisitInput, type VisitInput } from "@/lib/api";
import { useRecorder } from "@/lib/hooks";
import { useSession } from "@/lib/session";

type Step = "species" | "name" | "voice" | "hatching";
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;
const HATCH_LINES = ["Listening to you…", "Remembering what matters…", "Finding its colours…", "Almost here…"];

function nameProblem(n: string) {
  if (n.length === 0) return null;
  if (n.length < 3) return "At least 3 characters";
  if (n.length > 32) return "32 characters at most";
  if (!LABEL_RE.test(n) || n.includes("--")) return "Letters, numbers and single hyphens — not at the start or end";
  return null;
}

export function HatchFlow() {
  const { session, familiar, loading, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  // A note that hits the 60 s limit is sent automatically, like releasing the button.
  const autoSubmit = useRef<((a: { blob: Blob; filename: string }) => void) | null>(null);
  const recorder = useRecorder({ onAutoStop: (a) => autoSubmit.current?.(a) });
  const nameId = useId();
  const [step, setStep] = useState<Step>("species");
  const [species, setSpecies] = useState<SpeciesId>("fox");
  const [name, setName] = useState("");
  const [checked, setChecked] = useState<{ name: string; available: boolean } | null>(null);
  const [takenOverride, setTakenOverride] = useState<string | null>(null);
  const availability: "idle" | "checking" | "available" | "taken" =
    !name || nameProblem(name) ? "idle" : takenOverride === name ? "taken" : checked?.name !== name ? "checking" : checked.available ? "available" : "taken";
  const [signInOpen, setSignInOpen] = useState(false);
  const [line, setLine] = useState(0);
  const [hatchedName, setHatchedName] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const noMic = recorder.state === "unsupported" || recorder.state === "denied";
  const chosen = SPECIES.find((s) => s.id === species)!;

  useEffect(() => {
    if (!name || nameProblem(name)) return;
    const id = setTimeout(async () => {
      try {
        setChecked({ name, available: (await api.checkName(name)).available });
      } catch {
        setChecked(null);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [name]);

  useEffect(() => {
    if (step !== "hatching") return;
    const id = setInterval(() => setLine((l) => Math.min(l + 1, HATCH_LINES.length - 1)), 7000);
    return () => clearInterval(id);
  }, [step]);

  if (!loading && familiar && !hatchedName) {
    return (
      <Centered>
        <p className="text-2xl font-semibold tracking-tight">You already have {familiar.label}.</p>
        <p className="text-muted-foreground">A Familiar is bonded to one human. Yours is waiting.</p>
        <ButtonLink href={`/f/${familiar.label}`} size="lg">Visit {familiar.label}</ButtonLink>
      </Centered>
    );
  }

  const hatch = async (input: VisitInput) => {
    setStep("hatching");
    setLine(0);
    const form = new FormData();
    form.set("name", name);
    form.set("species", chosen.id);
    form.set("color", chosen.color);
    setVisitInput(form, input);
    try {
      const r = await api.hatch(form);
      setHatchedName(r.familiar.label); // keep the hatching screen up until we navigate
      router.push(`/f/${r.familiar.label}?hatched=1`);
      void refresh();
    } catch (e) {
      if (isApiError(e, "NAME_TAKEN") || isApiError(e, "CONFLICT")) {
        setStep("name");
        setTakenOverride(name);
      } else if (isApiError(e, "ALREADY_HAS_FAMILIAR")) {
        await refresh();
      } else {
        setStep("voice");
      }
      toast(isApiError(e) ? e.message : "The egg didn't hatch — try again", "error");
    }
  };

  // eslint-disable-next-line react-hooks/refs -- kept in sync for the recorder's auto-stop callback
  autoSubmit.current = (audio) => void hatch({ audio });

  const steps: Step[] = ["species", "name", "voice"];
  const index = steps.indexOf(step);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 pt-6 md:grid-cols-[1fr_1fr] md:items-center md:pt-12">
      <div className="order-2 flex flex-col gap-8 md:order-1">
        {step !== "hatching" && (
          <div className="flex items-center gap-3">
            {index > 0 ? (
              <button className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-accent" onClick={() => setStep(steps[index - 1]!)} aria-label="Back">
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            ) : (
              <Link href="/" className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-accent" aria-label="Back home">
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            )}
            <ol className="flex gap-1.5" aria-label={`Step ${index + 1} of 3`}>
              {steps.map((s, i) => (
                <li key={s} className={cn("h-1.5 w-8 rounded-full transition-colors", i <= index ? "bg-primary" : "bg-muted ring-1 ring-inset ring-border")} />
              ))}
            </ol>
          </div>
        )}

        {step === "species" && (
          <section className="flex animate-rise flex-col gap-6" aria-labelledby="species-title">
            <div>
              <h1 id="species-title" className="text-4xl font-semibold tracking-tight">Who will you meet?</h1>
              <p className="mt-2 text-muted-foreground">Choose a kind. Its look stays the same; everything else, it learns from you.</p>
            </div>
            <fieldset className="grid grid-cols-4 gap-2 sm:gap-3">
              <legend className="sr-only">Species</legend>
              {SPECIES.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-2xl bg-paper ring-1 transition-[box-shadow,transform] duration-200 ease-out-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    species === s.id ? "ring-2 ring-primary" : "ring-border hover:-translate-y-0.5",
                  )}
                >
                  <input type="radio" name="species" value={s.id} checked={species === s.id} onChange={() => setSpecies(s.id)} className="sr-only" />
                  <span className="relative block aspect-square">
                    <Image src={s.art} alt="" fill sizes="(min-width: 768px) 140px, 25vw" className="object-cover" />
                  </span>
                  <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] font-medium sm:px-3 sm:py-2 sm:text-sm">
                    <span className="truncate">{s.name}</span>
                    {species === s.id && <Check className="hidden size-4 shrink-0 text-primary sm:block" aria-hidden />}
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-muted-foreground">{chosen.line}</p>
            <Button size="lg" className="self-start" onClick={() => setStep("name")}>Continue</Button>
          </section>
        )}

        {step === "name" && (
          <form
            className="flex animate-rise flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (availability === "available") setStep("voice");
            }}
          >
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">Give it a name.</h1>
              <p className="mt-2 text-muted-foreground">It becomes a real name, yours for as long as you keep visiting.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={nameId} className="text-sm font-medium">Name</label>
              <div className="flex h-14 items-center rounded-2xl border border-border bg-card px-4 shadow-soft focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
                <input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="ember"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={32}
                  className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/60"
                  aria-describedby={`${nameId}-hint`}
                  aria-invalid={Boolean(nameProblem(name)) || availability === "taken"}
                  autoFocus
                />
                <span className="font-mono text-sm text-muted-foreground">.familiar.eth</span>
              </div>
              <p id={`${nameId}-hint`} className={cn("text-sm", nameProblem(name) || availability === "taken" ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
                {nameProblem(name) ??
                  (availability === "checking"
                    ? "Checking…"
                    : availability === "available"
                      ? `${name}.familiar.eth is free`
                      : availability === "taken"
                        ? "That name is taken — try another"
                        : "3–32 letters, numbers or hyphens")}
              </p>
            </div>
            <Button type="submit" size="lg" className="self-start" disabled={availability !== "available"}>Continue</Button>
          </form>
        )}

        {step === "voice" && (
          <section className="flex animate-rise flex-col gap-6" aria-labelledby="voice-title">
            <div>
              <h1 id="voice-title" className="text-4xl font-semibold tracking-tight">Tell it three things you care about.</h1>
              <p className="mt-2 text-muted-foreground">
                Anything: a person, a place, a habit, a fear. It hatches from what you {inputMode === "text" || noMic ? "write" : "say"}.
                {inputMode === "voice" && !noMic && " Your voice is never stored."}
              </p>
            </div>
            {!session && !loading ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="font-medium">Sign in to hatch {name}.</p>
                <p className="text-sm text-muted-foreground">A Familiar is bonded to the person who hatches it.</p>
                <Button className="self-start" onClick={() => setSignInOpen(true)}>Sign in</Button>
              </div>
            ) : inputMode === "text" || noMic ? (
              <div className="flex max-w-lg flex-col items-start gap-2">
                <TypeBox
                  onSend={(text) => void hatch({ text })}
                  label="Three things you care about"
                  placeholder="My little sister, chai at 6am, and shipping my hackathon project…"
                  sendLabel={`Hatch ${name}`}
                  disabled={!session}
                  autoFocus={inputMode === "text"}
                />
                {!noMic && <InputModeToggle mode="text" onChange={setInputMode} />}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <MicButton
                  recorder={recorder}
                  onRecorded={(audio) => void hatch({ audio })}
                  onTooShort={() => toast("That was quick — hold a little longer and tell it a bit more", "error")}
                  disabled={!session}
                />
                {recorder.state !== "recording" && <InputModeToggle mode="voice" onChange={setInputMode} />}
              </div>
            )}
          </section>
        )}

        {step === "hatching" && (
          <section className="flex flex-col gap-4" aria-live="polite" aria-busy>
            <h1 className="text-4xl font-semibold tracking-tight">{name} is hatching.</h1>
            <p className="text-lg text-muted-foreground">{HATCH_LINES[line]}</p>
            <p className="text-sm text-muted-foreground">About a minute. It&apos;s registering {name}.familiar.eth and painting its first portrait.</p>
          </section>
        )}
      </div>

      <div className="order-1 flex justify-center md:order-2">
        <Device
          image={step === "hatching" ? ART.eggCrack : step === "species" ? chosen.art : ART.egg}
          mood={step === "hatching" ? "hatching" : recorder.state === "recording" ? "listening" : "idle"}
          level={recorder.level}
          label={step === "species" ? `${chosen.name} Familiar` : "An egg, about to hatch"}
          className="aspect-square w-full max-w-[440px]"
        />
      </div>
      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">{children}</div>;
}
