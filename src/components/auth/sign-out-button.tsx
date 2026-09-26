"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

/**
 * Signs out this browser only. The default global scope would end every
 * session of the account, so one viewer of a shared demo account would sign
 * out all the others.
 *
 * A failed sign-out leaves the session alive in supabase-js, so the button
 * reports it and stays put instead of navigating.
 */
export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      let error: unknown;
      try {
        ({ error } = await createClient().auth.signOut({ scope: "local" }));
      } catch (thrown) {
        error = thrown;
      }
      if (error) {
        setFailed(true);
        return;
      }
      // The refresh drops the client router cache, so Back cannot restore
      // the signed-in header from memory.
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" onClick={handleClick} disabled={isPending}>
        Wyloguj się
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Nie udało się wylogować. Spróbuj ponownie.
        </p>
      )}
    </div>
  );
}
