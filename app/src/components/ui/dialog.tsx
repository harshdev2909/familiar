"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "./cn";

/**
 * Native <dialog> modal: focus trap, Escape to close and inert background come from the platform.
 * Renders as a bottom sheet on small screens.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-3xl border border-border bg-popover p-0 text-popover-foreground shadow-soft backdrop:bg-[oklch(0.2_0.01_30/0.35)] backdrop:backdrop-blur-[2px] open:animate-rise sm:m-auto sm:max-w-md sm:rounded-3xl",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div>
          <h2 id="dialog-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <button onClick={onClose} className="-mr-2 -mt-1 grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-accent" aria-label="Close">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="px-6 pb-6 pt-4">{children}</div>
    </dialog>
  );
}
