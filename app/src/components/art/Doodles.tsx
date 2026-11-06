import { cn } from "../ui/cn";

/**
 * Hand-drawn night doodles: stars, a crescent, sleepy z's and a dotted orbit. Pure SVG, coloured with
 * brand tokens, purely decorative. Motion is CSS-only and switches off with reduced motion.
 */

const STAR = "M12 2.6c.6 4.6 2.6 6.7 7.4 7.4-4.8.7-6.8 2.8-7.4 7.4-.6-4.6-2.6-6.7-7.4-7.4 4.8-.7 6.8-2.8 7.4-7.4Z";

export function Star({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} style={style} aria-hidden>
      <path d={STAR} fill="currentColor" />
    </svg>
  );
}

export function Crescent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <path d="M19.6 14.6A8.1 8.1 0 0 1 9.3 4.3a8.1 8.1 0 1 0 10.3 10.3Z" fill="currentColor" />
    </svg>
  );
}

export function Zzz({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 32" className={cn("h-8 w-10", className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 22h7l-7 7.4h7.4" />
      <path d="M16.4 12.6h5.4l-5.4 5.8h5.8" opacity=".75" />
      <path d="M27.2 4.6h4l-4 4.2h4.3" opacity=".5" />
    </svg>
  );
}

/** A slowly turning dotted orbit with a few stars, set behind the device. */
export function Orbit({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      <svg viewBox="0 0 400 400" className="size-full animate-[spin_90s_linear_infinite] text-soft motion-reduce:animate-none">
        <ellipse cx="200" cy="205" rx="186" ry="182" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.5 9" strokeLinecap="round" opacity=".55" />
        <path transform="translate(354 128) scale(.9)" d={STAR} fill="currentColor" opacity=".8" />
        <path transform="translate(22 250) scale(.6)" d={STAR} fill="currentColor" opacity=".6" />
        <path transform="translate(250 372) scale(.5)" d={STAR} fill="currentColor" opacity=".55" />
        <circle cx="96" cy="44" r="3" fill="currentColor" opacity=".5" />
        <circle cx="318" cy="330" r="2.4" fill="currentColor" opacity=".45" />
      </svg>
      <Star className="absolute left-[8%] top-[18%] size-3 animate-[twinkle_3.6s_ease-in-out_infinite] text-primary/70 motion-reduce:animate-none" />
      <Star className="absolute right-[6%] top-[46%] size-2.5 animate-[twinkle_4.4s_ease-in-out_1.2s_infinite] text-soft motion-reduce:animate-none" />
      <Star className="absolute bottom-[14%] left-[16%] size-2 animate-[twinkle_5s_ease-in-out_2s_infinite] text-soft motion-reduce:animate-none" />
    </div>
  );
}

/** Hand-drawn divider: a soft wave with three stars. */
export function Divider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center text-soft", className)} aria-hidden>
      <svg viewBox="0 0 220 24" className="h-6 w-56" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M2 12c14-7 24 7 38 0s24-7 38 0" opacity=".6" />
        <path d="M142 12c14-7 24 7 38 0s24-7 38 0" opacity=".6" />
        <path transform="translate(98 0) scale(1)" d={STAR} fill="currentColor" stroke="none" />
        <circle cx="88" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="132" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

/** A loose scatter of tiny stars for empty spaces. */
export function StarScatter({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden text-soft", className)} aria-hidden>
      {[
        ["6%", "22%", 10, 0],
        ["18%", "70%", 7, 1.4],
        ["44%", "12%", 6, 2.2],
        ["72%", "28%", 9, 0.6],
        ["88%", "66%", 7, 3],
        ["62%", "84%", 5, 1.8],
      ].map(([l, t, s, d], i) => (
        <Star
          key={i}
          className="absolute animate-[twinkle_4.8s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ left: l as string, top: t as string, width: s as number, height: s as number, animationDelay: `${d}s` }}
        />
      ))}
    </div>
  );
}
