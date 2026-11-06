import { Suspense } from "react";
import { Skeleton } from "@/components/ui/card";
import { FamiliarScreen } from "./FamiliarScreen";

export default function FamiliarPage({ params }: PageProps<"/f/[name]">) {
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <FamiliarScreen params={params} />
    </Suspense>
  );
}

function ScreenSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-2">
      <Skeleton className="aspect-square rounded-full" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
