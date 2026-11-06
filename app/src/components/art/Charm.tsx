import { cn } from "../ui/cn";

/**
 * The star charm you toss to spot a Familiar: a chubby, hand-drawn star on a ribbon loop, with a
 * sleepy little face. Original art; decorative.
 */
export function StarCharm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 72" className={cn("h-16 w-14", className)} aria-hidden>
      {/* ribbon loop */}
      <path d="M32 14c-5.5-9.5-14-8.6-13.6-3.4.4 4.6 7.6 5.2 13.6 3.4Zm0 0c5.5-9.5 14-8.6 13.6-3.4-.4 4.6-7.6 5.2-13.6 3.4Z" fill="var(--blush)" stroke="var(--blush-ink)" strokeWidth="1.8" strokeLinejoin="round" />
      {/* star body */}
      <path
        d="M32 15.6c2.6 0 4 6.4 6.6 9.6 2.3 2.8 10.6 2.6 11.6 5.4 1 2.9-5.7 6.5-7 10.2-1.2 3.4 2.6 10.6.2 12.4-2.5 1.9-8.2-3.6-11.4-3.6s-8.9 5.5-11.4 3.6c-2.4-1.8 1.4-9 .2-12.4-1.3-3.7-8-7.3-7-10.2 1-2.8 9.3-2.6 11.6-5.4 2.6-3.2 4-9.6 6.6-9.6Z"
        fill="var(--butter)"
        stroke="var(--butter-ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* shine */}
      <path d="M24.6 30.4c.8-2.2 2.4-3.6 4.2-4.2" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".8" />
      {/* face */}
      <path d="M26.4 37.2c.9.9 2.1.9 3 0M34.6 37.2c.9.9 2.1.9 3 0" fill="none" stroke="var(--butter-ink)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M30.4 41.2c1 .8 2.2.8 3.2 0" fill="none" stroke="var(--butter-ink)" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="24.4" cy="40.6" rx="2" ry="1.2" fill="var(--blush-ink)" opacity=".35" />
      <ellipse cx="39.6" cy="40.6" rx="2" ry="1.2" fill="var(--blush-ink)" opacity=".35" />
    </svg>
  );
}

/** A tiny four-point sparkle. */
export function Sparkle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-3", className)} style={style} aria-hidden>
      <path d="M12 2.6c.6 4.6 2.6 6.7 7.4 7.4-4.8.7-6.8 2.8-7.4 7.4-.6-4.6-2.6-6.7-7.4-7.4 4.8-.7 6.8-2.8 7.4-7.4Z" fill="currentColor" />
    </svg>
  );
}

/** A soft filled heart (for floating hearts). */
export function SoftHeart({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} style={style} aria-hidden>
      <path d="M12 20c-4.6-2.7-8-6.1-8-10.1 0-2.4 1.8-4.2 4-4.2 1.7 0 3 .9 4 2.5 1-1.6 2.3-2.5 4-2.5 2.2 0 4 1.8 4 4.2 0 4-3.4 7.4-8 10.1Z" fill="currentColor" />
      <path d="M7.4 9.2c.2-1 .9-1.7 1.8-1.9" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
