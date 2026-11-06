import Image from "next/image";
import { cn } from "@/components/ui/cn";
import { TONE_CLASS, speciesArt, toneOf } from "@/lib/art";

/** A Familiar's round portrait in its species' pastel ring. Falls back to the species art. */
export function Avatar({
  species,
  portraitUrl,
  alt = "",
  size = 56,
  className,
  ringWidth = 3,
}: {
  species: string;
  portraitUrl: string | null;
  alt?: string;
  size?: number;
  className?: string;
  ringWidth?: number;
}) {
  const tone = TONE_CLASS[toneOf(species)];
  return (
    <span
      className={cn("relative inline-block shrink-0 rounded-full p-[var(--rw)] shadow-sticker", tone.solid, className)}
      style={{ width: size, height: size, ["--rw" as string]: `${ringWidth}px` }}
    >
      <span className="relative block size-full overflow-hidden rounded-full bg-paper">
        <Image src={portraitUrl ?? speciesArt(species)} alt={alt} fill sizes={`${size * 2}px`} className="object-cover" />
      </span>
    </span>
  );
}
