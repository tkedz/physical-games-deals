import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

/**
 * The signed-in user for this request, or null. Never redirects: every view is
 * public, and a view decides for itself what a visitor sees.
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
  } = await supabase.auth.getUser();
  return user;
});
