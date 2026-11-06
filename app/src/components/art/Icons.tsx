import type { SVGProps } from "react";

/**
 * Familiar's hand-drawn icon family: 24×24, rounded 1.6 strokes, slightly organic curves so they
 * sit naturally next to the watercolour illustrations. Decorative by default (aria-hidden).
 */
type P = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...p}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Fed — a little bowl with warm steam. */
export const BowlIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.6 11.4c5.4-.5 11.5-.5 16.8 0-.3 4.6-3.8 7.9-8.4 7.9s-8.1-3.3-8.4-7.9Z" />
    <path d="M9.5 19.2 9 20.6h6l-.5-1.4" />
    <path d="M9.4 8.2c-.9-1 .9-1.9 0-3.2M12.6 8.4c-.9-1.1.9-2 0-3.4M15.6 8.2c-.9-1 .9-1.9 0-3.2" />
  </Svg>
);

/** Awake — a crescent with one star. */
export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19.6 14.6A8.1 8.1 0 0 1 9.3 4.3a8.1 8.1 0 1 0 10.3 10.3Z" />
    <path d="M17.2 3.6v2.8M15.8 5h2.8" />
  </Svg>
);

/** Bond — a soft, hand-drawn heart. */
export const HeartIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 19.6c-4.4-2.6-7.6-5.9-7.6-9.7 0-2.3 1.7-4 3.8-4 1.6 0 2.9.9 3.8 2.4.9-1.5 2.2-2.4 3.8-2.4 2.1 0 3.8 1.7 3.8 4 0 3.8-3.2 7.1-7.6 9.7Z" />
  </Svg>
);

/** Talk — a small vintage microphone. */
export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3.2" width="6" height="10.6" rx="3" />
    <path d="M5.8 11.2c.2 3.5 2.9 6.1 6.2 6.1s6-2.6 6.2-6.1M12 17.3v3.3M9 20.8h6" />
  </Svg>
);

/** Remember — a quill. */
export const QuillIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19.8 3.6C12.6 4.4 7.9 9.6 6.6 17.4l.9.9c7.8-1.3 13-6 12.3-14.7Z" />
    <path d="M6.6 17.4 3.8 20.2M10.2 13.8l4.4-.6M8.6 15.4l1.6-4" />
  </Svg>
);

/** Change — a paintbrush with a drop. */
export const BrushIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 4.2 11.4 12.8" />
    <path d="M11.4 12.8c-2-.5-3.9.9-4.2 3-.3 1.8-1.4 2.9-3 3.2 2.4 1.7 6.7 1.2 7.9-1.7.5-1.3.3-2.9-.7-4.5Z" />
    <path d="M17.6 15.4c.9 1.2 1.5 2.1 1.5 2.8a1.5 1.5 0 0 1-3 0c0-.7.6-1.6 1.5-2.8Z" />
  </Svg>
);

/** Privacy — a paper lantern. */
export const LanternIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 3.4h4M12 3.4v2" />
    <path d="M8 6.6c-2.4 2.8-2.4 8.4 0 11.2h8c2.4-2.8 2.4-8.4 0-11.2Z" />
    <path d="M12 6.6v11.2M9.4 20.6h5.2" />
    <path d="M12 10.4c-.8.9-.8 2.3 0 3.2.8-.9.8-2.3 0-3.2Z" fill="currentColor" stroke="none" />
  </Svg>
);

/** Receipts — a wax seal. */
export const SealIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.4c1.3 0 1.9 1.1 3 1.4 1.2.3 2.4-.2 3.1.8.7.9.1 2.1.4 3.2.3 1.1 1.3 1.9 1.1 3.2-.2 1.2-1.4 1.6-1.9 2.7-.5 1-.3 2.4-1.3 3-1 .7-2.1-.1-3.3.1-1.1.2-1.9 1.1-3.1.9-1.2-.2-1.6-1.4-2.6-1.9-1-.6-2.4-.4-3-1.4-.6-1 .3-2.1.2-3.2-.1-1.2-1.1-2-.8-3.2.3-1.2 1.6-1.4 2.4-2.2.8-.8 1.1-2.2 2.3-2.6.4-.1.9-.1 1.5-.1Z" />
    <path d="m9 12 2 2 4-4.2" />
  </Svg>
);

/** The ember — a soft four-point spark. */
export const EmberIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.2c.5 4.2 2.4 6.2 6.8 6.8-4.4.6-6.3 2.6-6.8 6.8-.5-4.2-2.4-6.2-6.8-6.8 4.4-.6 6.3-2.6 6.8-6.8Z" />
    <path d="M18.4 16.6v2.8M17 18h2.8" />
  </Svg>
);
