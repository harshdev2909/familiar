"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { api } from "@/lib/api";
import { ART } from "@/lib/art";
import { Skeleton } from "../ui/card";

/** Every night's portrait. Owners also see what their Familiar said. */
export function Gallery({ name, refreshKey }: { name: string; refreshKey: number }) {
  const q = useQuery({ queryKey: ["history", name, refreshKey], queryFn: () => api.history(name, 60) });
  if (q.isPending)
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  if (q.isError) return <p className="text-sm text-muted-foreground">Couldn&apos;t load memories.</p>;
  const visits = q.data.visits;
  if (visits.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center">
        <Image src={ART.egg} alt="" width={88} height={88} className="rounded-full bg-paper ring-1 ring-border" />
        <p className="text-sm text-muted-foreground">No nights yet. The first portrait appears after your first visit.</p>
      </div>
    );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {visits.map((v) => {
        const videoUrl = "video" in v ? v.video.url : v.videoUrl;
        return (
        <li key={v.day} className="flex flex-col gap-2">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-paper ring-1 ring-border">
            {v.imageUrl && <Image src={v.imageUrl} alt={`Night ${v.day}${v.mood ? `, ${v.mood}` : ""}`} fill sizes="(min-width: 1024px) 22vw, 45vw" className="object-cover" unoptimized />}
            {videoUrl && (
              <video src={videoUrl} className="absolute inset-0 size-full object-cover" muted loop playsInline autoPlay aria-label={`Evolution on night ${v.day}`} />
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Night {v.day}</span>
            <span className="text-muted-foreground">{v.mood}</span>
          </div>
          {"reply" in v && v.reply && <p className="text-sm leading-snug text-muted-foreground">“{v.reply}”</p>}
        </li>
        );
      })}
    </ul>
  );
}
