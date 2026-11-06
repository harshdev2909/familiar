import { cn } from "../ui/cn";

/**
 * A single-colour logo drawn through a CSS mask, so it takes `currentColor` (or `color`) and works in
 * both themes — for the black or white single-shape marks in /public/logos.
 */
export function LogoMark({ src, label, className, color }: { src: string; label?: string; className?: string; color?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-6 shrink-0 bg-current", className)}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
