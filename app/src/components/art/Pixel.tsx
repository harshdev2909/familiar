import { cn } from "../ui/cn";

/**
 * Pixel art for the egg device's LCD, drawn by hand on a tiny grid. "X" is ink, "o" is a highlight,
 * "." is empty. Crisp edges, coloured with currentColor so it inherits the LCD ink.
 */
function Grid({ rows, className, title }: { rows: string[]; className?: string; title?: string }) {
  const w = rows[0]!.length;
  const h = rows.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} shapeRendering="crispEdges" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" opacity={c === "o" ? 0.35 : 1} />,
        ),
      )}
    </svg>
  );
}

const HEART_FULL = [".XX.XX.", "XoXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
const HEART_EMPTY = [".XX.XX.", "X..X..X", "X.....X", ".X...X.", "..X.X..", "...X..."];

export function PixelHeart({ full = true, className }: { full?: boolean; className?: string }) {
  return <Grid rows={full ? HEART_FULL : HEART_EMPTY} className={cn("h-[0.86em] w-[1em]", className)} />;
}

/** A row of `max` hearts with `value` filled. */
export function PixelHearts({ value, max = 4, label, className }: { value: number; max?: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} role="img" aria-label={`${label}: ${v} of ${max} hearts`}>
      {Array.from({ length: max }, (_, i) => (
        <PixelHeart key={i} full={i < v} className={cn("transition-opacity duration-300", i >= v && "opacity-60")} />
      ))}
    </span>
  );
}

const BOWL = ["..X.X..", ".X.X...", ".......", "XXXXXXX", "XoXXXXX", ".XXXXX.", "..XXX.."];
const SMILE = [".XXXXX.", "X.....X", "X.X.X.X", "X.....X", "XX...XX", "X.XXX.X", ".XXXXX."];
const BOLT = ["...XX..", "..XX...", ".XX....", "XXXXXX.", "...XX..", "..XX...", ".XX...."];
const NOTE = ["..XXXX.", "..X..X.", "..X..X.", "..X..X.", "XXX.XXX", "XXX.XXX", "......."];

export const PixelBowl = ({ className }: { className?: string }) => <Grid rows={BOWL} className={cn("size-[1em]", className)} />;
export const PixelSmile = ({ className }: { className?: string }) => <Grid rows={SMILE} className={cn("size-[1em]", className)} />;
export const PixelBolt = ({ className }: { className?: string }) => <Grid rows={BOLT} className={cn("size-[1em]", className)} />;
export const PixelNote = ({ className }: { className?: string }) => <Grid rows={NOTE} className={cn("size-[1em]", className)} />;
