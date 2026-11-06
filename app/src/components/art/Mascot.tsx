import Image from "next/image";
import { cn } from "../ui/cn";

/** Ember, the mascot, in a soft round window. Decorative unless `alt` is given. */
export function Mascot({ src, alt = "", size = 72, className }: { src: string; alt?: string; size?: number; className?: string }) {
  return (
    <span className={cn("relative inline-block shrink-0 overflow-hidden rounded-full bg-paper ring-1 ring-border", className)} style={{ width: size, height: size }}>
      <Image src={src} alt={alt} fill sizes={`${size * 2}px`} className="object-cover" />
    </span>
  );
}
