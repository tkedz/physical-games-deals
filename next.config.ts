import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
// The .ts extension is written out, as in the scripts that load the same file
// under Node's type stripping, which does not rewrite specifiers; Next's
// loader for this config resolves it too. TypeScript accepts it through
// "allowImportingTsExtensions" in tsconfig.json.
import { refuseSupabaseTarget } from "./src/lib/env/supabase-target.ts";

/**
 * A function of the phase, so that the Supabase target guard runs under
 * `next dev` alone. `next build` and `next start`, on Vercel and on this
 * machine, load the same config without it.
 */
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    // Next loads the env files before it calls this, with the process
    // environment ahead of them (loadConfig in
    // node_modules/next/dist/server/config.js), so these are the values the
    // dev server would use. Throwing stops it before it serves a page: an
    // unswapped .env.local would otherwise show production data and let a
    // sign-up create a production account. `npm run dev:hosted` passes,
    // because .env.hosted.local sets SUPABASE_TARGET=hosted.
    const refusal = refuseSupabaseTarget({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      target: process.env.SUPABASE_TARGET,
    });
    if (refusal !== null) throw new Error(refusal);
  }

  return {
    experimental: {
      // Off because the RAWG request URL carries the key: under `next dev`
      // this cache clones every fetch body, and a clone that fails to read is
      // logged with its URL (src/lib/games/catalog.ts).
      serverComponentsHmrCache: false,
    },
  };
}
