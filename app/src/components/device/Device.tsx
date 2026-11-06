"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { useReducedMotion, useWebGL } from "@/lib/browser";
import { cn } from "../ui/cn";
import type { DeviceProps } from "./Device3D";

export type { DeviceMood } from "./Device3D";

/** Static stand-in (SSR, loading, no WebGL): the portrait in an egg-shaped window. */
function DeviceFallback({ image, asleep, className }: { image: string; asleep?: boolean; className?: string }) {
  return (
    <div className={cn("grid h-full w-full place-items-center", className)}>
      <div className="relative aspect-[0.82] w-[58%] overflow-hidden rounded-[50%/58%_58%_42%_42%] bg-paper shadow-soft ring-1 ring-border">
        <Image src={image} alt="" fill sizes="320px" className={cn("object-cover", asleep && "opacity-50 grayscale")} priority unoptimized={/^https?:/.test(image)} />
      </div>
    </div>
  );
}

const Device3D = dynamic(() => import("./Device3D"), { ssr: false, loading: () => null });

/**
 * The Familiar's device. A real 3D object when WebGL is available (lazy-loaded so it never blocks
 * the page), otherwise a still portrait. `label` describes what the screen shows for screen readers.
 */
export function Device({ className, label, ...props }: DeviceProps & { className?: string; label: string }) {
  const canRender = useWebGL();
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  return (
    <div className={cn("relative", className)} role="img" aria-label={label}>
      {canRender ? (
        <>
          <DeviceFallback
            image={props.image}
            asleep={props.mood === "asleep"}
            className={cn("absolute inset-0 transition-opacity duration-500", ready ? "pointer-events-none opacity-0" : "opacity-100")}
          />
          <div className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
            <Device3D {...props} reducedMotion={reduced || props.reducedMotion} onReady={() => setReady(true)} />
          </div>
        </>
      ) : (
        <DeviceFallback image={props.image} asleep={props.mood === "asleep"} />
      )}
    </div>
  );
}
