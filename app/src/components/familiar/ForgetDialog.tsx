"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api, isApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export function ForgetDialog({ name, open, onClose }: { name: string; open: boolean; onClose: () => void }) {
  const id = useId();
  const router = useRouter();
  const { refresh } = useSession();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={onClose} title={`Forget ${name}?`} description="Deletes its memory, every portrait, reply, voice and receipt we hold. This can't be undone.">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.forget(name);
            await refresh();
            router.push("/");
          } catch (err) {
            setError(isApiError(err) ? err.message : "Couldn't forget right now");
            setBusy(false);
          }
        }}
      >
        <label htmlFor={id} className="text-sm">
          Type <span className="font-mono font-medium">{name}</span> to confirm
        </label>
        <input
          id={id}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-12 rounded-xl border border-border bg-input px-4 font-mono outline-none focus-visible:outline-2 focus-visible:outline-ring"
        />
        <p className="text-xs text-muted-foreground">Its onchain name stays yours. Hatching {name} again starts with a blank memory.</p>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} disabled={typed.trim().toLowerCase() !== name} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          Forget {name}
        </Button>
      </form>
    </Dialog>
  );
}
