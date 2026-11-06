import { cn } from "./cn";

/** Tamagotchi-style care meter: a label and N pips. `value` is 0..1. */
export function Meter({ label, value, pips = 5, hint, tone = "primary", icon }: { label: string; value: number; pips?: number; hint?: string; tone?: "primary" | "muted"; icon?: React.ReactNode }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * pips);
  return (
    <div className="flex flex-col gap-1.5" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={pips} aria-valuenow={filled} aria-valuetext={hint}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon && <span className="text-primary">{icon}</span>}
        {label}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: pips }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors duration-500",
              i < filled ? (tone === "primary" ? "bg-primary" : "bg-foreground/60") : "bg-muted ring-1 ring-inset ring-border",
            )}
          />
        ))}
      </div>
      {hint && <span className="truncate font-mono text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
