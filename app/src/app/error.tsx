"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ART } from "@/lib/art";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-5 py-24 text-center" role="alert">
      <div className="relative size-32 overflow-hidden rounded-full bg-paper ring-1 ring-border">
        <Image src={ART.eggCrack} alt="" fill sizes="128px" className="object-cover" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Something cracked.</h1>
      <p className="text-muted-foreground">It&apos;s on our side, not yours. Try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
