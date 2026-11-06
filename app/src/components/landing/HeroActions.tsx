"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, isApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, ButtonLink } from "../ui/button";
import { useToast } from "../ui/toast";

export function HeroActions() {
  const { familiar, signInDemo } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 5 * 60_000 });
  return (
    <div className="flex flex-wrap items-center gap-3">
      {familiar ? (
        <ButtonLink href={`/f/${familiar.label}`} size="lg">
          Visit {familiar.label}
        </ButtonLink>
      ) : (
        <ButtonLink href="/hatch" size="lg">
          Hatch yours
        </ButtonLink>
      )}
      {config.data?.demo && (
      <Button
        variant="outline"
        size="lg"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await signInDemo();
            router.push(`/f/${r.demo}`);
          } catch (e) {
            toast(isApiError(e, "NOT_FOUND") ? "The demo Familiar isn't set up here yet" : "Couldn't open the demo", "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        Try the demo
      </Button>
      )}
    </div>
  );
}
