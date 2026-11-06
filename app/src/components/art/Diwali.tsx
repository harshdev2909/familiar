import { cn } from "../ui/cn";

/**
 * Hand-drawn Diwali marks: a clay diya with a living flame, a rangoli mandala, a marigold toran and
 * fairy lights. Pure SVG; all motion is CSS and stops with reduced motion.
 */

export function Diya({ className, lit = true }: { className?: string; lit?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-12", className)} aria-hidden>
      {lit && (
        <g className="origin-[32px_30px] animate-[flicker_1.8s_ease-in-out_infinite] motion-reduce:animate-none">
          <ellipse cx="32" cy="22" rx="10" ry="12" fill="oklch(0.88 0.14 80 / 0.35)" />
          <path d="M32 8c4.5 6 6.6 10.2 6.6 13.4A6.6 6.6 0 0 1 32 28a6.6 6.6 0 0 1-6.6-6.6C25.4 18.2 27.5 14 32 8Z" fill="oklch(0.84 0.16 70)" />
          <path d="M32 15c2.2 3.2 3.2 5.4 3.2 7a3.2 3.2 0 0 1-6.4 0c0-1.6 1-3.8 3.2-7Z" fill="oklch(0.97 0.06 95)" />
        </g>
      )}
      <path d="M31 28.5h2v3h-2z" fill="oklch(0.3 0.03 40)" />
      <path d="M8.5 33c7 0 12-1.6 23.5-1.6S48.5 33 55.5 33c-1.4 9.8-11 16.6-23.5 16.6S9.9 42.8 8.5 33Z" fill="oklch(0.58 0.13 40)" />
      <path d="M8.5 33c7 0 12-1.6 23.5-1.6S48.5 33 55.5 33" fill="none" stroke="oklch(0.42 0.11 35)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 38.5c5 2.6 11 3.6 18 3.6s13-1 18-3.6" fill="none" stroke="oklch(0.8 0.12 75)" strokeWidth="1.4" strokeDasharray="0.1 4" strokeLinecap="round" />
      <ellipse cx="32" cy="54" rx="15" ry="2.6" fill="oklch(0.3 0.03 40 / 0.12)" />
    </svg>
  );
}

/** Rangoli: eight petals, two rings of dots, drawn as if in powder. */
export function Rangoli({ className }: { className?: string }) {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="0 0 120 120" className={cn("size-24", className)} aria-hidden>
      <g transform="translate(60 60)">
        {petals.map((a, i) => (
          <path key={a} transform={`rotate(${a})`} d="M0-10C9-20 9-36 0-50-9-36-9-20 0-10Z" fill={i % 2 ? "oklch(0.72 0.15 40)" : "oklch(0.8 0.14 75)"} opacity=".9" />
        ))}
        {petals.map((a) => (
          <path key={`i${a}`} transform={`rotate(${a + 22.5})`} d="M0-12C4-18 4-26 0-32-4-26-4-18 0-12Z" fill="oklch(0.62 0.16 10)" opacity=".85" />
        ))}
        <circle r="11" fill="oklch(0.55 0.12 160)" />
        <circle r="5" fill="oklch(0.85 0.14 85)" />
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={`d${i}`} cx={Math.cos((i * Math.PI) / 12) * 55} cy={Math.sin((i * Math.PI) / 12) * 55} r="1.8" fill="oklch(0.72 0.15 40)" />
        ))}
      </g>
    </svg>
  );
}

/** Marigold toran: a hanging garland of marigolds and mango leaves, for the top of the page. */
export function Toran({ className }: { className?: string }) {
  const n = 22;
  return (
    <div className={cn("pointer-events-none h-6 w-full overflow-hidden", className)} aria-hidden>
      <svg viewBox="0 0 1100 28" preserveAspectRatio="none" className="h-full w-full">
        <path d="M0 4 Q 275 16 550 4 T 1100 4" fill="none" stroke="oklch(0.5 0.08 60)" strokeWidth="1.2" />
        {Array.from({ length: n }, (_, i) => {
          const x = (i + 0.5) * (1100 / n);
          const y = 4 + Math.sin((x / 1100) * Math.PI * 2) * -6 + 6;
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              {i % 2 === 0 ? (
                <path d="M0 0c4 4 4 11 0 16-4-5-4-12 0-16Z" fill="oklch(0.56 0.12 145)" />
              ) : (
                <>
                  <circle r="6" cy="5" fill="oklch(0.76 0.16 60)" />
                  <circle r="3.4" cy="5" fill="oklch(0.84 0.15 80)" />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A string of fairy lights that twinkle one after another. */
export function FairyLights({ className, count = 14 }: { className?: string; count?: number }) {
  return (
    <div className={cn("pointer-events-none flex w-full items-start justify-between", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="flex flex-col items-center" style={{ marginTop: Math.sin((i / (count - 1)) * Math.PI) * 10 }}>
          <span className="h-2 w-px bg-foreground/20" />
          <span
            className="size-2 animate-[twinkle_2.6s_ease-in-out_infinite] rounded-full shadow-[0_0_10px_2px_oklch(0.85_0.14_80/0.7)] motion-reduce:animate-none"
            style={{ background: i % 3 === 0 ? "oklch(0.84 0.15 80)" : i % 3 === 1 ? "oklch(0.72 0.15 40)" : "oklch(0.9 0.08 95)", animationDelay: `${(i % 5) * 0.4}s` }}
          />
        </span>
      ))}
    </div>
  );
}
