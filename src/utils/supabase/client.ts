import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for client components ("use client").
 * Uses the publishable key — access to data is guarded by RLS, not by this key.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
