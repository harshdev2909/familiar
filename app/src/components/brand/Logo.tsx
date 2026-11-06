import { cn } from "../ui/cn";

/** The egg mark: an egg with a single ember — the Familiar before it hatches. */
export function EggMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 28" className={cn("h-6 w-auto", className)} aria-hidden>
      <path d="M12 1.5C6.6 1.5 2.5 9.2 2.5 16.2 2.5 22.3 6.7 26.5 12 26.5s9.5-4.2 9.5-10.3C21.5 9.2 17.4 1.5 12 1.5Z" fill="var(--card)" stroke="var(--foreground)" strokeWidth="1.6" />
      <circle cx="12" cy="17" r="3.1" fill="var(--primary)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.03em]", className)}>
      <EggMark />
      familiar
    </span>
  );
}
