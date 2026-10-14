import { createClient } from "@supabase/supabase-js";
// The .ts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name. TypeScript
// accepts it through "allowImportingTsExtensions" in tsconfig.json.
import { refuseSupabaseTarget } from "../../src/lib/env/supabase-target.ts";

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
 * Before it builds the client, it checks the URL against SUPABASE_TARGET
 * (src/lib/env/supabase-target.ts): unset or `local` takes only the local
 * stack, `hosted` only the hosted project. A local run whose .env.local still
 * holds the hosted values stops here, before a single request, instead of
 * writing to production. The collect workflow sets SUPABASE_TARGET=hosted,
 * and so does .env.hosted.local, which `npm run extract:report:hosted` loads.
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
      "NEXT_PUBLIC_SUPABASE_URL is not set — put it in .env.local for the local stack, in .env.hosted.local for hosted runs, or in the workflow's env block.",
    );
  }
  // Ahead of the key check, so a mismatched environment is reported as the
  // mismatch whatever else it lacks, and ahead of createClient, so nothing
  // reaches the wrong database.
  const refusal = refuseSupabaseTarget({
    url,
    target: process.env.SUPABASE_TARGET,
  });
  if (refusal !== null) throw new Error(refusal);
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set — put it in .env.local for the local stack, in .env.hosted.local for hosted runs, or in the workflow's env block.",
    );
  }

  return createClient(url, secretKey, {
    // There is no session to keep: the secret key is the whole credential, and
    // the process is gone once the run ends.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
