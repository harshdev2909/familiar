import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { ART } from "@/lib/art";
import { PawTrail } from "@/components/art/Handmade";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-5 py-24 text-center">
      <div className="relative size-32 overflow-hidden rounded-full bg-paper ring-1 ring-border">
        <Image src={ART.asleep} alt="" fill sizes="128px" className="object-cover" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Nothing lives here.</h1>
      <p className="text-muted-foreground">This page wandered off. Your Familiar didn&apos;t.</p>
      <PawTrail steps={5} className="h-7" />
      <ButtonLink href="/">Go home</ButtonLink>
    </div>
  );
}
