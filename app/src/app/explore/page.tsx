import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/card";
import { ExploreScreen } from "./ExploreScreen";

export const metadata: Metadata = { title: "Explore", description: "Spot the Familiars out tonight, add them to your Dex and send a daily gift." };

export default function ExplorePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-28 aspect-[3/2] w-full max-w-6xl rounded-blob" />}>
      <ExploreScreen />
    </Suspense>
  );
}
