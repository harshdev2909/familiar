"use client";

import { useQuery } from "@tanstack/react-query";
import { BookHeart, ChevronDown, LogOut, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFestival } from "@/lib/festival";
import { useSession } from "@/lib/session";
import { Toran } from "./art/Diwali";
import { EmberIcon } from "./art/Icons";
import { Logo } from "./brand/Logo";
import { SignInDialog } from "./SignIn";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function useNav() {
  const { familiar } = useSession();
  return [
    { href: familiar ? `/f/${familiar.label}` : "/", label: familiar ? familiar.label : "Home", match: familiar ? `/f/${familiar.label}` : "/" },
    { href: "/explore", label: "Explore", match: "/explore" },
    { href: "/quests", label: "Quests", match: "/quests" },
    { href: "/shop", label: "Shop", match: "/shop" },
  ];
}

/** Sparks balance, always one tap from the shop. */
export function SparksPill({ className }: { className?: string }) {
  const { familiar } = useSession();
  if (!familiar) return null;
  return (
    <Link href="/shop" className={cn("inline-flex h-9 items-center gap-1.5 rounded-full bg-wash px-3 text-sm font-medium tabular-nums text-primary hover:bg-accent", className)} aria-label={`${familiar.sparks} Sparks — open the shop`}>
      <EmberIcon className="size-4" />
      {familiar.sparks}
    </Link>
  );
}

function CreditsPill() {
  const q = useQuery({ queryKey: ["credits"], queryFn: api.credits, refetchInterval: 60_000 });
  const iai = q.data?.iai;
  if (!iai) return null;
  const amount = iai.currency === "usd" ? `$${(Number(iai.credit) / 1e6).toFixed(2)}` : `${(Number(iai.credit) / 1e18).toFixed(3)} 0G`;
  return (
    <span className="hidden h-9 items-center rounded-full border border-border px-3 font-mono text-xs text-muted-foreground lg:inline-flex" title="Daily 0G credits — refresh at 00:00 UTC">
      {amount} today
    </span>
  );
}

function AccountMenu() {
  const { session, familiar, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!session) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-2.5 text-sm hover:bg-accent"
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold uppercase text-primary-foreground">{(familiar?.label ?? session.address.slice(2)).slice(0, 2)}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-64 animate-rise rounded-2xl border border-border bg-popover p-2 shadow-soft">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{familiar ? familiar.name : "No Familiar yet"}</p>
            <p className="font-mono text-xs text-muted-foreground">{short(session.address)} · {session.method === "iai" ? "0G account" : "wallet"}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          {familiar ? (
            <Link role="menuitem" href={`/f/${familiar.label}`} onClick={() => setOpen(false)} className="flex h-10 items-center rounded-xl px-3 text-sm hover:bg-accent">
              Visit {familiar.label}
            </Link>
          ) : (
            <Link role="menuitem" href="/hatch" onClick={() => setOpen(false)} className="flex h-10 items-center rounded-xl px-3 text-sm hover:bg-accent">
              Hatch a Familiar
            </Link>
          )}
          <Link role="menuitem" href="/dex" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm hover:bg-accent">
            <BookHeart className="size-4 text-muted-foreground" aria-hidden /> Dex
          </Link>
          <Link role="menuitem" href="/connect" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm hover:bg-accent">
            <MessagesSquare className="size-4 text-muted-foreground" aria-hidden /> ChatGPT &amp; Claude
          </Link>
          <div className="my-1 h-px bg-border" />
          <button role="menuitem" onClick={() => void signOut().then(() => setOpen(false))} className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const festive = Boolean(useFestival());
  const { session, familiar, loading } = useSession();
  const nav = useNav();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href={familiar ? `/f/${familiar.label}` : "/"} className="rounded-full" aria-label="Familiar">
          <Logo />
        </Link>
        {session && (
          <nav className="hidden items-center gap-1 rounded-full bg-muted/70 p-1 md:flex" aria-label="Main">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={path === n.match ? "page" : undefined}
                className={cn("h-8 rounded-full px-4 text-sm leading-8 transition-colors", path === n.match ? "bg-card font-medium text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="h-9 w-24 animate-pulse rounded-full bg-muted" aria-hidden />
          ) : session ? (
            <>
              {session.method === "iai" && <CreditsPill />}
              <SparksPill />
              <AccountMenu />
            </>
          ) : (
            <>
              <Link href="/explore" className="inline-flex h-10 items-center rounded-full px-3 text-sm text-muted-foreground hover:text-foreground">
                Explore
              </Link>
              <Link href="/shop" className="hidden h-10 items-center rounded-full px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
                Shop
              </Link>
              <Button size="sm" onClick={() => setOpen(true)}>
                Sign in
              </Button>
            </>
          )}
        </div>
      </div>
      {festive && <Toran className="-mt-1 opacity-90" />}
      <SignInDialog open={open} onClose={() => setOpen(false)} />
    </header>
  );
}

/** Static first paint of the header (prerendered), replaced once the route is known. */
export function HeaderShell() {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Logo />
        <span className="h-9 w-24 animate-pulse rounded-full bg-muted" aria-hidden />
      </div>
    </header>
  );
}

/** Game-style tab bar on phones. */
export function BottomNav() {
  const { session } = useSession();
  const nav = useNav();
  const path = usePathname();
  if (!session) return null;
  return (
    <nav className="fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-full border border-border bg-card/90 p-1.5 shadow-soft backdrop-blur-md md:hidden" aria-label="Main">
      {nav.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={path === n.match ? "page" : undefined}
          className={cn("flex h-11 flex-1 items-center justify-center rounded-full text-sm", path === n.match ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground")}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
