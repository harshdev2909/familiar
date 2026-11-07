import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/card";
import { TradesScreen } from "./TradesScreen";

export const metadata: Metadata = { title: "Swaps", description: "Swap accessories with Familiars you've spotted." };

export default function TradesPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-96 w-full max-w-4xl rounded-blob" />}>
      <TradesScreen />
    </Suspense>
  );
}
