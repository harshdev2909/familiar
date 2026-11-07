import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/card";
import { MeetScreen } from "./MeetScreen";

export const metadata: Metadata = {
  title: "We met",
  description: "Met a Familiar's keeper in person? Say so, and it goes in your Dex for triple Sparks.",
  robots: { index: false },
};

export default function MeetPage({ params }: PageProps<"/meet/[label]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-10 h-[30rem] w-full max-w-md rounded-blob" />}>
      <MeetScreen params={params} />
    </Suspense>
  );
}
