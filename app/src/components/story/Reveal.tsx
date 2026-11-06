"use client";

import { useEffect, useRef } from "react";

/**
 * Fades in every `[data-reveal]` inside it as it scrolls into view. Only things that start below the
 * fold are hidden (so nothing blinks on load), and nothing is hidden at all with reduced motion or
 * without IntersectionObserver. The motion itself is plain CSS in globals.css.
 */
export function Reveal({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.reveal = "shown";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    for (const el of items) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) continue;
      el.dataset.reveal = "hidden";
      io.observe(el);
    }
    return () => {
      io.disconnect();
      for (const el of items) el.dataset.reveal = "shown";
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
