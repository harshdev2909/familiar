import { cn } from "../ui/cn";

/**
 * Handmade: a sketchbook of small, original illustrations — Mumbai by the sea, an auto-rickshaw, a
 * paper kite, clouds, paw prints, a gift, a map pin, a scribbled underline, a speech bubble, a moon
 * mobile, a potted tulsi, washi tape and bunting. Ink lines are `currentColor` (set it with a text
 * class); fills use the pastel tokens, so every piece follows the theme into dark mode. Everything is
 * decorative (aria-hidden). Motion is opt-in, CSS-only, and stops with reduced motion.
 */

type ArtProps = { className?: string; style?: React.CSSProperties };
export type Tone = "blush" | "mint" | "butter" | "lilac" | "sky" | "peach";

const INK = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const STAR = "M12 2.6c.6 4.6 2.6 6.7 7.4 7.4-4.8.7-6.8 2.8-7.4 7.4-.6-4.6-2.6-6.7-7.4-7.4 4.8-.7 6.8-2.8 7.4-7.4Z";
const MOTION = "motion-reduce:animate-none";

/** Which default a caller's class replaces (base classes only — variants like `md:h-8` add to it). */
function slot(c: string) {
  if (c.includes(":")) return null;
  if (/^-?(relative|absolute|fixed|sticky|static)$/.test(c)) return "position";
  if (c.startsWith("size-")) return "size";
  if (c.startsWith("h-")) return "h";
  if (c.startsWith("w-")) return "w";
  if (c.startsWith("text-") && !/^text-(xs|sm|base|lg|xl|\d+xl|\[)/.test(c)) return "color";
  return null;
}

/**
 * `cn` without the surprises: a default size, colour or position is dropped when the caller passes
 * their own (Tailwind would otherwise let the larger utility win, whatever the order).
 */
function art(defaults: string, className?: string) {
  if (!className) return defaults;
  const taken = new Set(className.split(/\s+/).map(slot));
  const keep = defaults.split(/\s+/).filter((d) => {
    const g = slot(d);
    if (!g) return true;
    if (taken.has(g)) return false;
    if (taken.has("size") && (g === "h" || g === "w")) return false;
    if ((taken.has("h") || taken.has("w")) && g === "size") return false;
    return true;
  });
  return cn(...keep, className);
}

/** Mumbai from the water: the Gateway arch, a domed hotel, the city behind, boats on a lazy sea. */
export function MumbaiSkyline({ className, style }: ArtProps) {
  const waves = Array.from({ length: 10 }, (_, i) => i * 34);
  return (
    <svg viewBox="0 0 340 112" className={art("h-24 w-auto text-foreground/55", className)} style={style} aria-hidden>
      {/* moon + stars */}
      <path d="M300 14a10 10 0 1 0 10.6 13.4 8 8 0 0 1-10.6-13.4Z" {...INK} fill="var(--butter)" strokeWidth="1.3" />
      <path transform="translate(262 10) scale(.42)" d={STAR} fill="currentColor" opacity=".55" />
      <path transform="translate(40 18) scale(.32)" d={STAR} fill="currentColor" opacity=".45" />
      {/* birds */}
      <path d="M70 30c2-2 4-2 5 0 1-2 3-2 5 0M86 22c1.6-1.6 3.2-1.6 4 0 .8-1.6 2.4-1.6 4 0" {...INK} strokeWidth="1.1" opacity=".7" />
      {/* the city behind */}
      <path
        d="M4 82V58h10v-8h8v8h6V46h12v14h8V54h10v28M246 82V50h8v-6h10v6h6v-10h10v16h8v-4h12v12h10v-8h8v26"
        {...INK} fill="var(--lilac)"
        strokeWidth="1.2"
        opacity=".9"
      />
      <path d="M8 64h2M8 70h2M34 52v2M34 60v2M34 68v2M256 56h2M256 64h2M274 48v2M274 56v2M306 68h2" {...INK} strokeWidth="1.4" opacity=".5" />
      {/* the domed hotel */}
      <path d="M190 82V56h52v26" {...INK} fill="var(--blush)" strokeWidth="1.3" />
      <path d="M203 56c0-9 6-15 13-15s13 6 13 15" {...INK} fill="var(--blush)" strokeWidth="1.3" />
      <path d="M216 41v-5M190 56c0-4 2-7 5-7s5 3 5 7M232 56c0-4 2-7 5-7s5 3 5 7" {...INK} strokeWidth="1.2" />
      <path d="M197 64h0M205 64h0M213 64h0M221 64h0M229 64h0M236 64h0M197 72h0M205 72h0M213 72h0M221 72h0M229 72h0M236 72h0" {...INK} strokeWidth="2.4" opacity=".55" />
      {/* the Gateway */}
      <path d="M100 82V44h70v38" {...INK} fill="var(--peach)" strokeWidth="1.4" />
      <path d="M124 82V64c0-7 5-12 11-12s11 5 11 12v18" {...INK} fill="var(--card)" strokeWidth="1.4" />
      <path d="M106 82v-9c0-3 2-5 4.5-5s4.5 2 4.5 5v9M155 82v-9c0-3 2-5 4.5-5s4.5 2 4.5 5v9" {...INK} fill="var(--card)" strokeWidth="1.2" />
      <path d="M98 44h74M104 38h62v6M104 38v-8h8v8M158 38v-8h8v8M130 38v-6c0-3 2.4-5 5-5s5 2 5 5v6" {...INK} fill="var(--peach)" strokeWidth="1.3" />
      <path d="M108 30c0-3 1.8-5 4-5s4 2 4 5M162 30c0-3 1.8-5 4-5s4 2 4 5" {...INK} fill="var(--peach)" strokeWidth="1.2" transform="translate(-4 0)" />
      <path d="M116 48v0M122 48v0M128 48v0M142 48v0M148 48v0M154 48v0" {...INK} strokeWidth="2.2" opacity=".5" />
      {/* sea wall + sea */}
      <path d="M0 82h340" {...INK} strokeWidth="1.5" />
      <path d="M0 84h340v28H0Z" fill="var(--sky)" opacity=".85" />
      {waves.map((x, i) => (
        <path key={x} d={`M${x + (i % 2) * 10} ${94 + (i % 3) * 5}c4-3 8-3 12 0s8 3 12 0`} {...INK} strokeWidth="1.2" opacity=".55" />
      ))}
      {/* two little boats */}
      <path d="M52 95h22l-4 5H56Z" {...INK} fill="var(--butter)" strokeWidth="1.2" />
      <path d="M63 95V80l8 13Z" {...INK} fill="var(--card)" strokeWidth="1.1" />
      <path d="M268 100h16l-3 4h-10Z" {...INK} fill="var(--mint)" strokeWidth="1.1" />
      <path d="M276 100V89l6 9Z" {...INK} fill="var(--card)" strokeWidth="1" />
    </svg>
  );
}

/** A Mumbai auto-rickshaw: domed butter-yellow canopy, open sides, one wheel up front. */
export function AutoRickshaw({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 76 54" className={art("h-12 w-auto text-foreground/70", className)} style={style} aria-hidden>
      {/* speed lines */}
      <path d="M67 24h6M66 30h8M68 36h4" {...INK} strokeWidth="1.4" opacity=".45" />
      {/* canopy */}
      <path d="M14 26c0-10.6 9-17 25-17.4 15.4-.4 24.6 6 24.6 17.4Z" {...INK} fill="var(--butter)" strokeWidth="1.6" />
      <path d="M22 13.4c8-2.6 22-2.8 32-.2" {...INK} strokeWidth="1.1" opacity=".5" />
      {/* open side, with the back seat */}
      <path d="M30 26v-8.6c8-2.6 18-2.8 25.6-.6 2 .6 3.4 2.4 3.4 4.6V26Z" {...INK} fill="var(--card)" strokeWidth="1.3" />
      <path d="M46 26v-5.6c0-1 .8-1.6 1.8-1.6H57" {...INK} strokeWidth="1.3" opacity=".7" />
      {/* windscreen */}
      <path d="M15.4 26c.4-4 1.8-7.6 4.6-10.6V26Z" {...INK} fill="var(--card)" strokeWidth="1.2" />
      {/* body: low at the nose, rounded at the back */}
      <path d="M7 39c.4-6 2.6-10.6 6.6-13h50v10.4c0 2-1.6 3.6-3.6 3.6H8Z" {...INK} fill="var(--mint)" strokeWidth="1.6" />
      <path d="M12 33h50" {...INK} strokeWidth="1.1" opacity=".4" />
      {/* headlight + handlebar */}
      <circle cx="9" cy="34.4" r="1.9" {...INK} fill="var(--butter)" strokeWidth="1.1" />
      <path d="M20 22.6l4.4-1.6" {...INK} strokeWidth="1.4" />
      {/* one wheel in front, one behind */}
      <circle cx="15" cy="42" r="5.4" {...INK} fill="var(--card)" strokeWidth="1.6" />
      <circle cx="15" cy="42" r="1.5" fill="currentColor" />
      <circle cx="53" cy="42" r="6" {...INK} fill="var(--card)" strokeWidth="1.6" />
      <circle cx="53" cy="42" r="1.6" fill="currentColor" />
      <path d="M6 51h56" {...INK} strokeWidth="1.1" strokeDasharray="0.1 4" opacity=".5" />
    </svg>
  );
}

/** A paper kite on a wavy tail of bows. `sway` lets it drift on the breeze. */
export function PaperKite({ className, style, sway = false }: ArtProps & { sway?: boolean }) {
  return (
    <svg viewBox="0 0 52 80" className={art("h-16 w-auto text-foreground/65", className)} style={style} aria-hidden>
      <g className={cn(sway && `origin-[26px_6px] animate-sway ${MOTION}`)}>
        <path d="M26 4 44 24 26 46 8 24Z" {...INK} fill="var(--blush)" strokeWidth="1.6" />
        <path d="M26 4 44 24H26Z" fill="var(--butter)" />
        <path d="M8 24 26 46V24Z" fill="var(--butter)" />
        <path d="M26 4 44 24 26 46 8 24Z" {...INK} strokeWidth="1.6" />
        <path d="M26 6v38M10 24h32" {...INK} strokeWidth="1.1" opacity=".55" />
        <path d="M26 46c-5 6 5 9 0 15s5 9 1 15" {...INK} strokeWidth="1.2" />
        <path d="M22 56l4 2 4-2-1 4.4-3-1.6-3 1.6ZM23 69l4 2 4-2-1 4.4-3-1.6-3 1.6Z" {...INK} fill="var(--mint)" strokeWidth="1" />
      </g>
    </svg>
  );
}

/** A soft hand-drawn cloud. `drift` floats it slowly side to side. */
export function Cloud({ className, style, drift = false }: ArtProps & { drift?: boolean }) {
  return (
    <svg viewBox="0 0 64 36" className={art(cn("h-8 w-auto text-foreground/40", drift && `animate-drift ${MOTION}`), className)} style={style} aria-hidden>
      <path
        d="M12 31C7 31 4 28 4 24.4 4 20.6 7.2 18 11 18.4 11.6 12 16.4 7.6 22.6 7.6c4.4 0 8 2.4 9.8 6 1.6-1.4 3.6-2.2 5.8-2.2 4.6 0 8.4 3.4 8.8 8 .6-.1 1.2-.2 1.8-.2 3.8 0 6.8 2.8 6.8 6.2S52.6 31 48.8 31Z"
        {...INK} fill="var(--card)"
        strokeWidth="1.5"
      />
      <path d="M15 25.4c3 1.4 6 1.4 9 0M36 22.6c2 1 4 1 6 0" {...INK} strokeWidth="1.2" opacity=".5" />
    </svg>
  );
}

function Paw({ x, y, r, o }: { x: number; y: number; r: number; o: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`} opacity={o}>
      <ellipse cx="0" cy="2.6" rx="4.2" ry="3.6" />
      <circle cx="-4.6" cy="-3" r="1.7" />
      <circle cx="-1.6" cy="-5.6" r="1.8" />
      <circle cx="1.8" cy="-5.6" r="1.8" />
      <circle cx="4.8" cy="-3" r="1.7" />
    </g>
  );
}

/** Little paw prints wandering off to the right. */
export function PawTrail({ className, style, steps = 6 }: ArtProps & { steps?: number }) {
  const n = Math.max(2, Math.min(8, steps));
  return (
    <svg viewBox={`0 0 ${n * 26 + 4} 40`} className={art("h-8 w-auto text-primary/60", className)} style={style} aria-hidden>
      <g fill="currentColor">
        {Array.from({ length: n }, (_, i) => (
          <Paw key={i} x={14 + i * 26} y={i % 2 ? 26 : 14} r={78 + (i % 2 ? 8 : -6)} o={0.35 + (0.65 * (i + 1)) / n} />
        ))}
      </g>
    </svg>
  );
}

/** A wrapped present with a floppy bow. */
export function GiftBox({ className, style, tone = "lilac" }: ArtProps & { tone?: Tone }) {
  return (
    <svg viewBox="0 0 48 48" className={art("size-10 text-foreground/70", className)} style={style} aria-hidden>
      <path d="M9 22h30v17.6c0 1.8-1.4 3.4-3.2 3.4H12.2C10.4 43 9 41.4 9 39.6Z" {...INK} fill={`var(--${tone})`} strokeWidth="1.6" />
      <path d="M6.4 16.4c0-1.2.8-2 2-2h31.2c1.2 0 2 .8 2 2v4.6c0 .6-.4 1-1 1H7.4c-.6 0-1-.4-1-1Z" {...INK} fill={`var(--${tone})`} strokeWidth="1.6" />
      <path d="M21.6 14.4h4.8V43h-4.8Z" {...INK} fill="var(--blush)" strokeWidth="1.3" />
      <path d="M24 14.4c-3-6.4-10.6-8.4-10.6-3.8 0 3.2 5.4 3.8 10.6 3.8Zm0 0c3-6.4 10.6-8.4 10.6-3.8 0 3.2-5.4 3.8-10.6 3.8Z" {...INK} fill="var(--blush)" strokeWidth="1.4" />
      <path d="M24 14.4c-1.4 2.6-3.6 4.4-6 5.4M24 14.4c1.4 2.6 3.6 4.4 6 5.4" {...INK} strokeWidth="1.2" opacity=".7" />
      <path d="M13.4 28h0M16.4 35h0M32 27h0M34.6 34.4h0M14 39.4h0" {...INK} strokeWidth="2.2" opacity=".35" />
    </svg>
  );
}

/** A plump map pin with a heart in its window. */
export function MapPin({ className, style, tone = "peach" }: ArtProps & { tone?: Tone }) {
  return (
    <svg viewBox="0 0 32 46" className={art("h-10 w-auto text-foreground/70", className)} style={style} aria-hidden>
      <ellipse cx="16" cy="42.4" rx="6" ry="1.8" fill="currentColor" opacity=".15" />
      <path d="M16 40.6C14.6 40.4 4 28.4 4 18.6 4 11.4 9.4 5 16 5s12 6.4 12 13.6c0 9.8-10.6 21.8-12 22Z" {...INK} fill={`var(--${tone})`} strokeWidth="1.6" />
      <circle cx="16" cy="18" r="6.6" {...INK} fill="var(--card)" strokeWidth="1.3" />
      <path d="M16 21.4c-2.2-1.3-3.6-2.8-3.6-4.4 0-1 .8-1.8 1.7-1.8.8 0 1.4.4 1.9 1.1.5-.7 1.1-1.1 1.9-1.1.9 0 1.7.8 1.7 1.8 0 1.6-1.4 3.1-3.6 4.4Z" fill="var(--blush-ink)" opacity=".75" />
      <path d="M8.6 14c.8-2.4 2.6-4.2 4.8-5" {...INK} strokeWidth="1.4" opacity=".4" />
    </svg>
  );
}

/** A loopy marker underline. Stretches to its box; `draw` inks it in once. */
export function ScribbleUnderline({ className, style, draw = false }: ArtProps & { draw?: boolean }) {
  return (
    <svg viewBox="0 0 200 16" preserveAspectRatio="none" className={art("h-3 w-full text-soft", className)} style={style} aria-hidden>
      <path
        d="M3 9.6c30-5 66-6.4 100-5 30 1.2 60 2.6 94-1.2M18 13c42-3.8 94-4.4 150-1.6"
        {...INK}
        strokeWidth="2.4"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className={cn(draw && `animate-draw [stroke-dasharray:1] ${MOTION}`)}
      />
    </svg>
  );
}

/**
 * A hand-drawn speech bubble around any content. The outline wobbles via uneven corner radii; the
 * tail is a tiny SVG that sits over the border so the two read as one stroke.
 */
export function SpeechBubble({
  children,
  tail = "bottom",
  className,
  inkClassName = "text-soft",
}: {
  children: React.ReactNode;
  tail?: "bottom" | "left";
  className?: string;
  /** Text colour class for the outline. */
  inkClassName?: string;
}) {
  return (
    <span className={art(cn("relative inline-block", inkClassName, tail === "bottom" ? "mb-3" : "ml-3"), className)}>
      <span className="relative block rounded-[20px_24px_22px_16px/18px_20px_24px_22px] border-[1.5px] border-current bg-card px-4 py-2.5 text-foreground shadow-[0_2px_0_color-mix(in_oklch,currentColor_25%,transparent)]">
        {children}
      </span>
      {tail === "bottom" ? (
        <svg viewBox="0 0 20 14" className="absolute left-6 top-full -mt-[2px] h-3.5 w-5" aria-hidden>
          <path d="M2.5 0H17.5V1.2C13 7 7 11 1.4 13 4.4 9 4.6 5 2.5 1.2Z" fill="var(--card)" />
          <path d="M2.5 1.2C4.6 5 4.4 9 1.4 13 7 11 13 7 17.5 1.2" {...INK} strokeWidth="1.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 14 20" className="absolute right-full top-3 -mr-[2px] h-5 w-3.5" aria-hidden>
          <path d="M14 2.5V17.5H12.8C7 13 3 7 1 1.4 5 4.4 9 4.6 12.8 2.5Z" fill="var(--card)" />
          <path d="M12.8 2.5C9 4.6 5 4.4 1 1.4 3 7 7 13 12.8 17.5" {...INK} strokeWidth="1.5" />
        </svg>
      )}
    </span>
  );
}

/** A crib mobile: a star, a sleepy moon and a cloud, swaying slowly from one hook. */
export function MoonMobile({ className, style, sway = true }: ArtProps & { sway?: boolean }) {
  return (
    <svg viewBox="0 0 80 84" className={art("h-20 w-auto text-foreground/60", className)} style={style} aria-hidden>
      <path d="M40 1v8" {...INK} strokeWidth="1.3" />
      <g className={cn(sway && `origin-[40px_9px] animate-sway-slow ${MOTION}`)}>
        <path d="M10 14c10-5.4 50-5.4 60 0" {...INK} strokeWidth="2" />
        <path d="M17 12.4V36M40 10.4V50M63 12.4V32" {...INK} strokeWidth="1" opacity=".7" />
        {/* star */}
        <path transform="translate(6.6 33) scale(.86)" d={STAR} {...INK} fill="var(--butter)" strokeWidth="1.6" />
        {/* moon with a sleepy face */}
        <path d="M44 50a14 14 0 1 0 12.4 20.4A11 11 0 0 1 44 50Z" {...INK} fill="var(--butter)" strokeWidth="1.5" />
        <path d="M37 62.6c1 1 2.4 1 3.4 0M38.4 68c1.2.8 2.6.8 3.6 0" {...INK} strokeWidth="1.2" />
        <ellipse cx="35.2" cy="66" rx="1.6" ry="1" fill="var(--blush-ink)" opacity=".35" />
        {/* cloud */}
        <path d="M57 42c-2.6 0-4.4-1.6-4.4-3.6s1.6-3.4 3.6-3.4c.4-2.6 2.6-4.2 5-4.2 2.2 0 4 1.2 4.8 3.2 2.2 0 4 1.8 4 4s-1.8 4-4 4Z" {...INK} fill="var(--card)" strokeWidth="1.3" />
      </g>
    </svg>
  );
}

function Leaf({ x, y, r, s = 1 }: { x: number; y: number; r: number; s?: number }) {
  return <path transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} d="M0 0c2.6-3.4 7.4-3.8 10-.4C7.4 3 2.6 3.2 0 0Z" {...INK} fill="var(--mint)" strokeWidth="1.1" />;
}

/** A little tulsi plant in a terracotta pot, flowering at the tips. */
export function TulsiPlant({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 48 62" className={art("h-14 w-auto text-foreground/65", className)} style={style} aria-hidden>
      <path d="M24 38V12M24 30c-4-1.6-7.4-4.6-9-9M24 25c4-1.6 7.4-4.6 9-9M24 34c3.4-.8 6.4-2.8 8.6-6" {...INK} strokeWidth="1.3" />
      <Leaf x={24} y={13} r={-60} s={0.8} />
      <Leaf x={24} y={13} r={-120} s={0.8} />
      <Leaf x={15.4} y={22} r={-150} />
      <Leaf x={15} y={21.4} r={-100} s={0.8} />
      <Leaf x={32.6} y={17} r={-30} />
      <Leaf x={33} y={16.4} r={-80} s={0.8} />
      <Leaf x={24} y={30} r={-170} s={0.9} />
      <Leaf x={32.4} y={28.4} r={-10} s={0.9} />
      <Leaf x={24} y={36} r={-20} s={0.8} />
      {/* manjari: the little purple flower spikes */}
      <g fill="var(--lilac-ink)" opacity=".75">
        <circle cx="24" cy="8" r="1.2" />
        <circle cx="24" cy="5" r="1" />
        <circle cx="13.4" cy="17.6" r="1.1" />
        <circle cx="12.4" cy="15" r=".9" />
        <circle cx="34.4" cy="13.4" r="1.1" />
        <circle cx="35.6" cy="10.8" r=".9" />
      </g>
      {/* pot */}
      <path d="M11.6 43h24.8l-3 15.4c-.2 1-1 1.6-2 1.6H16.6c-1 0-1.8-.6-2-1.6Z" {...INK} fill="var(--peach)" strokeWidth="1.5" />
      <path d="M9.4 38.6c0-.8.6-1.4 1.4-1.4h26.4c.8 0 1.4.6 1.4 1.4v3c0 .8-.6 1.4-1.4 1.4H10.8c-.8 0-1.4-.6-1.4-1.4Z" {...INK} fill="var(--peach)" strokeWidth="1.5" />
      <path d="M18 50.6h0M24 52.4h0M30 50.6h0" {...INK} strokeWidth="2.4" opacity=".55" />
    </svg>
  );
}

/** A strip of washi tape with torn ends, for pinning art like a scrapbook. Size and tilt it with classes. */
export function WashiTape({ className, style, tone = "butter" }: ArtProps & { tone?: Tone }) {
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className={art("pointer-events-none h-6 w-20 text-foreground/15", className)} style={style} aria-hidden>
      <path d="M2.4 2.2 97.6 1l-2 4 2.6 4-2.4 4 2.4 4-2 4 1.4 2.4L1.6 23l2.4-4-2.6-4 2.4-4-2.4-4 2-4Z" fill={`var(--${tone})`} opacity=".88" />
      <path d="M14 1.8v20.4M30 1.6v20.8M46 1.4v21M62 1.4v21M78 1.2v21.2" stroke="currentColor" strokeWidth="5" vectorEffect="non-scaling-stroke" opacity=".6" />
    </svg>
  );
}

const BUNTING_TONES: Tone[] = ["blush", "butter", "mint", "sky", "lilac", "peach"];

/** A sagging string of little triangle flags across the full width. */
export function Bunting({ className, count = 13 }: { className?: string; count?: number }) {
  const sag = 8; // px at the middle of the string
  return (
    <div className={art("pointer-events-none relative h-8 w-full text-foreground/45", className)} aria-hidden>
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-5 w-full">
        <path d={`M0 2 Q50 ${2 + sag * 2} 100 2`} {...INK} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute inset-x-[2%] top-0 flex justify-between">
        {Array.from({ length: count }, (_, i) => {
          const t = (i + 0.5) / count;
          const tone = BUNTING_TONES[i % BUNTING_TONES.length]!;
          return (
            <svg
              key={i}
              viewBox="0 0 16 20"
              className="h-5 w-4"
              style={{ marginTop: 0.6 + 4 * sag * t * (1 - t), transform: `rotate(${(t - 0.5) * -14}deg)` }}
            >
              <path d="M1 1.4h14L8.4 18.6c-.2.5-.6.5-.8 0Z" {...INK} fill={`var(--${tone})`} strokeWidth="1.1" />
            </svg>
          );
        })}
      </div>
    </div>
  );
}

/** Snack crumbs that tumble out from under the creature. */
export function Crumbs({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 40 20" className={art("h-4 w-8 text-butter-ink", className)} style={style} aria-hidden>
      <path d="M4 12l3-2 2 3-3 2Z" {...INK} fill="var(--butter)" strokeWidth="1" />
      <path d="M14 6l4-1 1 3.4-3.6 1Z" {...INK} fill="var(--peach)" strokeWidth="1" />
      <path d="M24 13l3.4-.6.6 3-3.4.8Z" {...INK} fill="var(--butter)" strokeWidth="1" />
      <path d="M32 7l2.6-1.4 1.4 2.6-2.6 1.4Z" {...INK} fill="var(--peach)" strokeWidth="1" />
      <circle cx="19" cy="15" r="1" fill="currentColor" />
      <circle cx="10" cy="5" r=".8" fill="currentColor" />
      <circle cx="36" cy="14" r=".8" fill="currentColor" />
    </svg>
  );
}

/** A striped play ball. */
export function PlayBall({ className, style }: ArtProps) {
  return (
    <svg viewBox="0 0 24 24" className={art("size-6 text-foreground/70", className)} style={style} aria-hidden>
      <circle cx="12" cy="12" r="9" {...INK} fill="var(--sky)" strokeWidth="1.5" />
      <path d="M4 9.4c5 2.4 11 2.4 16 0M4.4 15.6c5 2 10.6 2 15.2-.4" fill="none" stroke="var(--blush-ink)" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <path d="M7.6 6.6c1-1 2.2-1.6 3.4-1.8" {...INK} strokeWidth="1.4" opacity=".45" />
    </svg>
  );
}

/**
 * The dotted trail between story chapters. `md` and up it swings across the page from one side to the
 * other (`flip` mirrors it); on phones it's a short wiggle down the art column.
 */
export function TrailPath({ flip = false, className, children }: { flip?: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <div className={art("relative h-16 text-soft md:h-28", className)} aria-hidden>
      <svg viewBox="0 0 24 64" className="absolute left-[26px] top-0 h-full w-6 sm:left-[50px] md:hidden">
        <path d="M12 2c-7 10 7 18 0 30s7 20 0 30" {...INK} strokeWidth="2" strokeDasharray="0.1 7" />
      </svg>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 hidden size-full md:block">
        <path
          d={flip ? "M75 0C75 46 30 30 25 100" : "M25 0C25 46 70 30 75 100"}
          {...INK}
          strokeWidth="2.4"
          strokeDasharray="0.1 9"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {children && <div className="absolute left-[64px] top-1/2 -translate-y-1/2 sm:left-[92px] md:left-1/2 md:-translate-x-1/2">{children}</div>}
    </div>
  );
}
