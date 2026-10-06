"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/**
 * Reads the deals again after a failed read. router.refresh() re-renders the
 * Server Components of the page in place, so scroll position and the header
 * stay as they are; the transition keeps the button disabled until the new
 * render arrives, which can take a while when the read fails again
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md).
 */
export function RetryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={isPending}>
      {isPending ? "Wczytywanie…" : "Spróbuj ponownie"}
    </Button>
  );
}
