"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import { Cloud, SpeechBubble, WashiTape } from "@/components/art/Handmade";
import { LogoMark } from "@/components/brand/LogoMark";
import { SignInDialog } from "@/components/SignIn";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api";
import type { ApiKeyView, CreatedApiKey } from "@/lib/api-types";
import { useSession } from "@/lib/session";

const MAX_KEYS = 5;
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

type Client = "chatgpt" | "claude";
const CLIENTS: { id: Client; name: string; logo: string }[] = [
  { id: "chatgpt", name: "ChatGPT", logo: "/logos/openai.svg" },
  { id: "claude", name: "Claude", logo: "/logos/claude.svg" },
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1800);
      return true;
    } catch {
      return false;
    }
  };
  return { copied, copy };
}

export function ConnectScreen() {
  const { session, familiar, loading } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const labelId = useId();
  const { copied, copy } = useCopy();
  const [signIn, setSignIn] = useState(false);
  const [client, setClient] = useState<Client>("chatgpt");
  const [label, setLabel] = useState("ChatGPT");
  const [fresh, setFresh] = useState<CreatedApiKey | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const name = familiar?.label ?? "your Familiar";

  const keys = useQuery({ queryKey: ["keys", session?.address ?? null], queryFn: api.keys, enabled: Boolean(session) });
  const create = useMutation({
    mutationFn: () => api.createKey(label.trim() || "My connector"),
    onSuccess: (r) => {
      setFresh({ ...r, connectorUrl: r.connectorUrl || `${window.location.origin}/api/mcp/${r.key}` });
      void qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e) => toast(isApiError(e) ? e.message : "Couldn't make a link — try again", "error"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeKey(id),
    onSuccess: (_r, id) => {
      setConfirming(null);
      if (fresh?.id === id) setFresh(null);
      qc.setQueriesData<{ keys: ApiKeyView[] }>({ queryKey: ["keys"] }, (d) => (d ? { keys: d.keys.filter((k) => k.id !== id) } : d));
      toast("Revoked. That link stops working right away.");
    },
    onError: (e) => toast(isApiError(e) ? e.message : "Couldn't revoke that — try again", "error"),
  });

  const live = keys.data?.keys ?? [];
  const atLimit = live.length >= MAX_KEYS;
  const prompts = [`Tell ${familiar?.label ?? "luma"} about my day: I finally shipped the demo and celebrated with vada pav.`, "Pet my familiar", "What quests are open?", "Who's out on the map tonight?"];

  return (
    <div className="pb-24">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-10 pt-6 md:grid-cols-[1.15fr_1fr] md:pt-12">
        <div className="flex animate-rise flex-col gap-5">
          <div className="flex items-center gap-2">
            {CLIENTS.map((c) => (
              <span key={c.id} className="inline-flex h-9 items-center gap-2 rounded-full bg-card px-3 text-sm font-medium shadow-sticker">
                <LogoMark src={c.logo} className="size-4" /> {c.name}
              </span>
            ))}
          </div>
          <h1 className="text-balance text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Talk to {name} from ChatGPT or Claude.</h1>
          <p className="max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Add Familiar as a connector once. Then tell it about your day, give it a pet, or check your quests without leaving the chat.
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <Cloud drift className="absolute -left-10 top-8 z-10 hidden h-9 sm:block" />
          <div className="sticker relative aspect-square overflow-hidden bg-lilac">
            <Image src="/art/ai/connect.jpg" alt="Ember the fox holding a microphone, a smiling speech bubble beside it" fill priority sizes="(min-width: 768px) 384px, 90vw" className="object-cover" />
          </div>
          <WashiTape tone="lilac" className="absolute -top-3 left-8 h-6 w-20 -rotate-6" />
          <WashiTape tone="butter" className="absolute -right-3 top-10 h-6 w-16 rotate-[70deg]" />
          <SpeechBubble className="absolute -bottom-4 -left-2 text-sm sm:-left-8">
            <span className="font-medium">psst, it works in chat too</span>
          </SpeechBubble>
        </div>
      </section>

      {!loading && !session ? (
        <section className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col items-start gap-4 rounded-blob bg-lilac p-6 sm:flex-row sm:items-center">
            <KeyRound className="size-8 shrink-0 text-lilac-ink" aria-hidden />
            <div className="flex-1">
              <p className="text-lg font-semibold tracking-tight">Sign in to make your connector link.</p>
              <p className="text-sm text-foreground/75">The link is yours alone, and you can switch it off any time.</p>
            </div>
            <Button onClick={() => setSignIn(true)}>Sign in</Button>
          </div>
        </section>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-6 px-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-6">
            {!loading && !familiar && (
              <div className="flex flex-wrap items-center gap-3 rounded-bubble bg-butter p-4 text-sm text-butter-ink">
                <span className="flex-1 text-foreground">You&apos;ll need a Familiar for the chat to talk to.</span>
                <ButtonLink href="/hatch" size="sm">Hatch yours</ButtonLink>
              </div>
            )}

            {/* Step 1 */}
            <section className="sticker flex flex-col gap-4 p-6" aria-labelledby="step-link">
              <div className="flex items-center gap-3">
                <StepDot n={1} />
                <h2 id="step-link" className="text-lg font-semibold tracking-tight">Make your connector link</h2>
              </div>
              {fresh ? (
                <div className="flex animate-rise flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    Here it is. <span className="font-medium text-foreground">We&apos;ll only show it once</span> — anyone with it can talk to {name}, so keep it to yourself.
                  </p>
                  <div className="flex items-center gap-2 rounded-2xl bg-muted p-2 pl-3">
                    <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-snug">{fresh.connectorUrl}</code>
                    <Button
                      size="sm"
                      variant={copied === fresh.connectorUrl ? "secondary" : "primary"}
                      className="h-10 shrink-0"
                      onClick={async () => {
                        if (!(await copy(fresh.connectorUrl))) toast("Couldn't copy — select the link and copy it by hand", "error");
                      }}
                    >
                      {copied === fresh.connectorUrl ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied === fresh.connectorUrl ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <button onClick={() => setFresh(null)} className="self-start rounded-full py-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    Done, I&apos;ve saved it
                  </button>
                </div>
              ) : (
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!atLimit) create.mutate();
                  }}
                >
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label htmlFor={labelId} className="text-sm font-medium">Name it</label>
                    <input
                      id={labelId}
                      value={label}
                      onChange={(e) => setLabel(e.target.value.slice(0, 40))}
                      maxLength={40}
                      placeholder="ChatGPT on my phone"
                      className="h-11 rounded-full border border-border bg-card px-4 text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                  </div>
                  <Button type="submit" loading={create.isPending} disabled={atLimit || !session}>
                    Create link
                  </Button>
                </form>
              )}
              {atLimit && !fresh && <p className="text-sm text-muted-foreground">That&apos;s {MAX_KEYS} links, the most you can have. Revoke one below to make another.</p>}
            </section>

            {/* Step 2 */}
            <section className="sticker flex flex-col gap-4 p-6" aria-labelledby="step-add">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StepDot n={2} />
                  <h2 id="step-add" className="text-lg font-semibold tracking-tight">Add it to your chat app</h2>
                </div>
                <div role="tablist" aria-label="Chat app" className="flex rounded-full bg-muted p-1">
                  {CLIENTS.map((c) => (
                    <button
                      key={c.id}
                      role="tab"
                      id={`tab-${c.id}`}
                      aria-selected={client === c.id}
                      aria-controls={`panel-${c.id}`}
                      onClick={() => setClient(c.id)}
                      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm", client === c.id ? "bg-card font-medium shadow-soft" : "text-muted-foreground hover:text-foreground")}
                    >
                      <LogoMark src={c.logo} className="size-3.5" /> {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <div role="tabpanel" id={`panel-${client}`} aria-labelledby={`tab-${client}`}>
                {client === "chatgpt" ? (
                  <Steps
                    items={[
                      <>Open ChatGPT, then <b>Settings → Apps &amp; Connectors</b>.</>,
                      <>Under <b>Advanced settings</b>, turn on <b>Developer mode</b>.</>,
                      <>Choose <b>Create</b> to add a custom connector. Name it “Familiar”, paste your link as the <b>MCP server URL</b>, and pick <b>No authentication</b>.</>,
                      <>Start a new chat, switch on Familiar from the <b>+</b> menu, and say hi to {name}.</>,
                    ]}
                  />
                ) : (
                  <Steps
                    items={[
                      <>Open Claude, then <b>Settings → Connectors</b>.</>,
                      <>Choose <b>Add custom connector</b>.</>,
                      <>Name it “Familiar” and paste your link as the <b>URL</b>. Then <b>Add</b>.</>,
                      <>In a chat, turn Familiar on from the <b>tools</b> menu, and say hi to {name}.</>,
                    ]}
                  />
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            {/* Step 3 */}
            <section className="sticker flex flex-col gap-4 p-6" aria-labelledby="step-try">
              <div className="flex items-center gap-3">
                <StepDot n={3} />
                <h2 id="step-try" className="text-lg font-semibold tracking-tight">Try saying</h2>
              </div>
              <ul className="grid gap-2">
                {prompts.map((p) => (
                  <li key={p}>
                    <button
                      onClick={() => void copy(p)}
                      className="squish flex w-full items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-left text-[15px] hover:bg-accent"
                      aria-label={`Copy “${p}”`}
                    >
                      <span className="flex-1">“{p}”</span>
                      {copied === p ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Typed visits count like spoken ones — one a night, same Sparks.</p>
            </section>

            {/* Keys */}
            <section className="flex flex-col gap-3" aria-labelledby="your-links">
              <h2 id="your-links" className="text-sm font-medium text-primary">Your links</h2>
              {keys.isPending ? (
                <Skeleton className="h-16 rounded-bubble" />
              ) : keys.isError ? (
                <div className="flex items-center justify-between gap-3 rounded-bubble border border-border p-4 text-sm">
                  <span className="text-muted-foreground">Couldn&apos;t load your links.</span>
                  <Button size="sm" variant="outline" onClick={() => keys.refetch()}>Retry</Button>
                </div>
              ) : live.length === 0 ? (
                <p className="rounded-bubble border border-dashed border-border p-4 text-sm text-muted-foreground">None yet. Make one above.</p>
              ) : (
                <ul className="grid gap-2">
                  {live.map((k) => (
                    <li key={k.id} className="flex items-center gap-3 rounded-bubble border border-border bg-card p-3 pl-4 shadow-soft">
                      <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{k.label}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {k.prefix}… · made {dateFmt.format(new Date(k.createdAt))} · {k.lastUsedAt ? `used ${dateFmt.format(new Date(k.lastUsedAt))}` : "not used yet"}
                        </p>
                      </div>
                      {confirming === k.id ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-10" onClick={() => setConfirming(null)}>Keep</Button>
                          <Button size="sm" className="h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90" loading={revoke.isPending && revoke.variables === k.id} onClick={() => revoke.mutate(k.id)}>
                            Revoke
                          </Button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirming(k.id)} className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive" aria-label={`Revoke ${k.label}`}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </div>
  );
}

function StepDot({ n }: { n: number }) {
  return <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lilac font-mono text-sm font-medium text-lilac-ink">{n}</span>;
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="grid gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border font-mono text-[11px] text-muted-foreground">{i + 1}</span>
          <span className="[&_b]:font-medium">{item}</span>
        </li>
      ))}
    </ol>
  );
}
