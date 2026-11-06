import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/card";
import { DexScreen } from "./DexScreen";

export const metadata: Metadata = { title: "Dex", description: "Every kind of Familiar you've spotted, and the friends you send gifts to." };

export default function DexPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-28 h-96 w-full max-w-6xl rounded-blob" />}>
      <DexScreen />
    </Suspense>
  );
}
