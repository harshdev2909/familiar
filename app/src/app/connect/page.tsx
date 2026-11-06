import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/card";
import { ConnectScreen } from "./ConnectScreen";

export const metadata: Metadata = { title: "ChatGPT & Claude", description: "Add Familiar to ChatGPT or Claude as a connector, and talk to your Familiar from any chat." };

export default function ConnectPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-28 h-96 w-full max-w-6xl rounded-blob" />}>
      <ConnectScreen />
    </Suspense>
  );
}
