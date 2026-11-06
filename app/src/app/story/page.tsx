import type { Metadata } from "next";
import { Cloud, ScribbleUnderline } from "@/components/art/Handmade";
import { Storybook } from "./Storybook";

export const metadata: Metadata = {
  title: "Ember's story",
  description: "A short storybook: an egg on your doorstep, a creature that listens each night, and the town of Familiars it wanders out to meet.",
};

export default function StoryPage() {
  return (
    <div className="bg-[image:var(--gradient-bg)] pb-24">
      <section className="relative mx-auto max-w-5xl px-5 pb-8 pt-6 md:pt-12">
        <Cloud drift className="absolute right-6 top-6 hidden h-10 sm:block" />
        <Cloud className="absolute right-32 top-16 hidden h-6 opacity-70 md:block" />
        <p className="text-sm font-medium text-primary">A storybook</p>
        <h1 className="mt-1 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="relative inline-block">
            Ember&apos;s story
            <ScribbleUnderline draw className="absolute inset-x-0 -bottom-2.5" />
          </span>
        </h1>
        <p className="mt-4 max-w-md text-pretty text-muted-foreground">Seven short pages about a little fox who listens. Yours will go a little differently.</p>
      </section>
      <section className="mx-auto max-w-5xl px-5" aria-label="Ember's story, one chapter per page">
        <Storybook />
      </section>
    </div>
  );
}
