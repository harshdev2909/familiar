import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/card";
import { WalkScreen } from "./WalkScreen";

export const metadata: Metadata = {
  title: "Night walk",
  description: "Three Familiars, one lantern-lit street, one shared painting.",
  robots: { index: false },
};

export default function WalkPage({ params }: PageProps<"/walk/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-[32rem] w-full max-w-3xl rounded-blob" />}>
      <WalkScreen params={params} />
    </Suspense>
  );
}
