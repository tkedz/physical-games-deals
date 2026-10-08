import "server-only";

import { cache } from "react";
import { isAuthSessionMissingError, type User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

/**
 * The signed-in user for this request, or null. Never redirects: the proxy
 * sends visitors away from private views (src/lib/auth/access.ts), and every
 * other view decides for itself what a visitor sees.
 *
 * `getUser()` asks the Auth server, so a revoked session reads as signed out.
 * Without a session cookie it returns before any network request, so a
 * visitor's page view costs no Auth call. React `cache` keeps it to one call
 * per render when a layout and its page both ask.
 *
 * `server-only` needs no package: Next.js resolves it internally
 * (node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // No session is the ordinary signed-out case. Any other error, an Auth
  // outage for one, renders a signed-in user as signed out, so its code
  // reaches the server log: never its message, as in src/lib/deals/queries.ts.
  if (error && !isAuthSessionMissingError(error)) {
    console.error(
      `Reading the session failed: ${error.code ?? error.status ?? "no code"}`,
    );
  }
  return user;
});
