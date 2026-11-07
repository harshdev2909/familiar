import { cn } from "../ui/cn";
import { Star } from "./Doodles";

/**
 * Lantern Night marks: a paper sky lantern with a living flame, and a small sky of them drifting up.
 * Pure SVG, decorative (aria-hidden). Motion is CSS-only and stops with reduced motion.
 */

export function SkyLantern({ className, style, lit = true }: { className?: string; style?: React.CSSProperties; lit?: boolean }) {
  return (
    <svg viewBox="0 0 40 52" className={cn("h-12 w-auto", className)} style={style} aria-hidden>
      {lit && <ellipse cx="20" cy="24" rx="18" ry="21" fill="oklch(0.86 0.14 75 / 0.22)" />}
      {/* paper body: wide at the top, open at the bottom */}
      <path
        d="M7.6 7.8C12 4.2 28 4.2 32.4 7.8L28.2 38c-3.2 2.4-13.2 2.4-16.4 0Z"
        fill={lit ? "oklch(0.84 0.13 70)" : "oklch(0.8 0.04 70)"}
        stroke="oklch(0.52 0.12 42)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* ribs */}
      <path d="M15.4 5.6 15 39.4M24.6 5.6 25 39.4" fill="none" stroke="oklch(0.52 0.12 42)" strokeWidth="1" strokeLinecap="round" opacity=".55" />
      {/* the glow inside the paper */}
      {lit && <ellipse cx="20" cy="30" rx="6.6" ry="7.4" fill="oklch(0.95 0.08 90 / 0.75)" />}
      {/* shine */}
      <path d="M11.4 12.4c-.4 5.6 0 12.4 1.2 18" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
      {/* the wire ring at the mouth */}
      <path d="M12 38.4c3 1.8 13 1.8 16 0" fill="none" stroke="oklch(0.42 0.08 40)" strokeWidth="1.3" strokeLinecap="round" />
      {lit && (
        <g className="origin-[20px_44px] animate-[flicker_1.6s_ease-in-out_infinite] motion-reduce:animate-none">
          <path d="M20 40.6c2 2.4 2.7 3.9 2.7 5a2.7 2.7 0 0 1-5.4 0c0-1.1.7-2.6 2.7-5Z" fill="oklch(0.84 0.16 70)" />
          <path d="M20 43c.9 1.1 1.2 1.8 1.2 2.4a1.2 1.2 0 0 1-2.4 0c0-.6.3-1.3 1.2-2.4Z" fill="oklch(0.97 0.06 95)" />
        </g>
      )}
    </svg>
  );
}

/** Where each lantern floats (% of the box), how big it is (px tall) and when it starts bobbing. */
const SKY = [
  { left: "6%", top: "14%", h: 34, delay: 0 },
  { left: "22%", top: "52%", h: 22, delay: 1.2 },
  { left: "38%", top: "8%", h: 26, delay: 0.6 },
  { left: "58%", top: "38%", h: 18, delay: 2 },
  { left: "72%", top: "6%", h: 30, delay: 1.6 },
  { left: "88%", top: "44%", h: 24, delay: 0.3 },
];

/**
 * A handful of sky lanterns and stars, absolutely positioned over a parent (`relative`). `count`
 * trims it for small spaces.
 */
export function LanternSky({ className, count = SKY.length, stars = true }: { className?: string; count?: number; stars?: boolean }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {SKY.slice(0, count).map((l, i) => (
        <span key={i} className="absolute animate-drift motion-reduce:animate-none" style={{ left: l.left, top: l.top, animationDelay: `${l.delay}s` }}>
          <SkyLantern className="animate-bob motion-reduce:animate-none" style={{ height: l.h, animationDelay: `${l.delay * 0.7}s` }} />
        </span>
      ))}
      {stars &&
        [
          ["14%", "34%", 7, 0.4],
          ["48%", "26%", 5, 1.8],
          ["66%", "62%", 6, 1],
          ["82%", "22%", 8, 2.6],
          ["30%", "76%", 5, 3.2],
        ].map(([l, t, s, d], i) => (
          <Star
            key={`s${i}`}
            className="absolute animate-[twinkle_4.2s_ease-in-out_infinite] text-[oklch(0.9_0.08_90)] motion-reduce:animate-none"
            style={{ left: l as string, top: t as string, width: s as number, height: s as number, animationDelay: `${d}s` }}
          />
        ))}
    </div>
  );
}
