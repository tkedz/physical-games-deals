import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for the two jobs that hold the secret key: the collector
 * (collect.mts and import-jsonl.mts), which writes through posts.mts, and the
 * deal extractor (scripts/extract/extract.mts, with its review report,
 * report.mts), which reads and writes through scripts/extract/store.mts.
 *
 * It authenticates with SUPABASE_SECRET_KEY, which bypasses row-level security.
 * That is a different posture from all three clients under src/utils/supabase/,
 * none of which may ever hold this key — so the factory lives beside the
 * collector, outside src/, where a Server Component cannot reach it by import.
 *
 * Not @supabase/ssr: that package exists for cookie-bearing browser sessions,
 * and there is no session here to keep.
 */
export function createCollectorClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  // Named explicitly, and thrown before anything is fetched, so a missing
  // secret fails loudly instead of presenting as a quiet "0 new entries".
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set — put it in .env.local locally, or in the workflow's env block.",
    );
  }
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set — put it in .env.local locally, or in the workflow's env block.",
    );
  }

  return createClient(url, secretKey, {
    // There is no session to keep: the secret key is the whole credential, and
    // the process is gone once the run ends.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
