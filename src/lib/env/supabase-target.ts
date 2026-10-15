/**
 * Which Supabase project a process may reach: the one decision behind the
 * guard in createCollectorClient() (scripts/collector/supabase.mts) and the
 * one in next.config.ts, which stops `next dev`. A stricter form of it,
 * refuseE2eTarget, guards the E2E runs: playwright.config.ts and
 * createE2eAdminClient() (scripts/e2e/accounts.mts).
 *
 * Local work runs against the Supabase stack on this machine, so a URL that
 * points anywhere else is the hosted project, which is production. A process
 * reaches it only where its environment says so in writing,
 * SUPABASE_TARGET=hosted: in .env.hosted.local, which `npm run dev:hosted` and
 * `npm run extract:report:hosted` load, and on the steps of
 * .github/workflows/collect.yml. An unswapped or overwritten .env.local then
 * stops a local run instead of writing to production. The check holds the
 * other way too, so a hosted run that picked up the local stack's URL says so
 * instead of quietly working on local data.
 *
 * No imports and no environment read: the values are passed in. Node loads
 * this file through the scripts, besides Next and Vitest, so it stays plain
 * erasable TypeScript.
 */

/**
 * The hosts of the local stack, as the URL parser normalises them: lower
 * case, IPv4 shorthand expanded (`127.1` is `127.0.0.1`), IPv6 compressed and
 * bracketed. Exact matches only, so `127.0.0.1.example.com` and
 * `localhost.example` are not loopback.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]",
]);

/**
 * The way out, ending every refusal: where each target's values live, and the
 * only two ways to reach the hosted project from this machine.
 */
const WAY_OUT =
  "Local runs take the local stack's values from .env.local. The hosted project is reached only through npm run dev:hosted or npm run extract:report:hosted, which load .env.hosted.local with SUPABASE_TARGET=hosted; .env.example describes the swap.";

export type SupabaseTargetInput = {
  /** The value of NEXT_PUBLIC_SUPABASE_URL. */
  url: string | undefined;
  /** The value of SUPABASE_TARGET. */
  target: string | undefined;
};

/**
 * Returns why `url` may not be used under `target`, or null when the pair is
 * allowed.
 *
 * Allowed: `target` unset or `local` with a loopback URL (127.0.0.1,
 * localhost or [::1], any port), and `hosted` with any other http or https
 * URL. Refused: a missing URL, one that is not http or https, a loopback URL
 * under `hosted`, and any other `target` value. The target is matched
 * case-sensitively, and an empty value counts as unset, as an empty line in
 * an env file reads.
 *
 * The message names the URL's host and the way out. It never repeats the URL
 * or the target as given: either may hold a key pasted into the wrong line.
 */
export function refuseSupabaseTarget({
  url,
  target,
}: SupabaseTargetInput): string | null {
  const declared = target === undefined || target === "" ? "local" : target;
  if (declared !== "local" && declared !== "hosted") {
    return `SUPABASE_TARGET holds a value other than "hosted" or "local", the only two it takes, matched case-sensitively; unset means "local". ${WAY_OUT}`;
  }

  if (url === undefined || url === "") {
    return `NEXT_PUBLIC_SUPABASE_URL is not set, so the Supabase target cannot be checked. ${WAY_OUT}`;
  }
  const parsed = parseHttpUrl(url);
  if (parsed === null) {
    return `NEXT_PUBLIC_SUPABASE_URL is not an http or https URL, so the Supabase target cannot be checked. ${WAY_OUT}`;
  }

  const loopback = LOOPBACK_HOSTS.has(parsed.hostname);
  if (declared === "local" && !loopback) {
    return `NEXT_PUBLIC_SUPABASE_URL points at ${parsed.host}, which is not the local Supabase stack, and SUPABASE_TARGET is not "hosted". ${WAY_OUT}`;
  }
  if (declared === "hosted" && loopback) {
    return `SUPABASE_TARGET is "hosted", but NEXT_PUBLIC_SUPABASE_URL points at ${parsed.host}, the local Supabase stack. ${WAY_OUT}`;
  }
  return null;
}

/**
 * Returns why an E2E run may not use `url` under `target`, or null when it
 * may.
 *
 * E2E runs against the local stack only: a run signs in and writes as test
 * users, and its account module holds the secret key, which creates and
 * deletes accounts. So `hosted` is refused whatever the URL, even where the
 * environment says so in writing, and every other pair is judged by
 * refuseSupabaseTarget, which then takes a loopback URL only.
 */
export function refuseE2eTarget({
  url,
  target,
}: SupabaseTargetInput): string | null {
  if (target === "hosted") {
    return "E2E tests run against the local Supabase stack only; unset SUPABASE_TARGET.";
  }
  return refuseSupabaseTarget({ url, target });
}

/**
 * The URL, parsed, when it is an http or https URL, or null otherwise. The
 * parser rejects either scheme with an empty host, so the hostname of a
 * result is never empty. `host` is the hostname plus any port, without the
 * credentials a URL may carry.
 */
function parseHttpUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? parsed
    : null;
}
