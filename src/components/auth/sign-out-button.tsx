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
 * When the logout request fails with anything but 401, 403 or 404,
 * supabase-js still deletes the local session before it returns the error
 * (auth-js `_signOut`). The browser is then signed out while the server's
 * session row stays unrevoked, so the button finishes as on success. It
 * reports a failure, and stays put, only while a session is still stored.
 */
export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      const supabase = createClient();
      let error: unknown;
      try {
        ({ error } = await supabase.auth.signOut({ scope: "local" }));
      } catch (thrown) {
        error = thrown;
      }
      if (error && (await hasStoredSession(supabase))) {
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

/** False only when the browser provably holds no session. */
async function hasStoredSession(
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    return error !== null || data.session !== null;
  } catch {
    return true;
  }
}
