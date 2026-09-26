/** What the proxy does with a request: let it through, or redirect it. */
export type AccessDecision = { kind: "pass" } | { kind: "redirect"; to: "/" };

// Exact, case-sensitive matches with no sub-paths: `/login/extra` and
// `/LOGIN` are different URLs from the auth pages, so they pass through.
const AUTH_PAGES: ReadonlySet<string> = new Set(["/login", "/signup"]);

/**
 * The proxy's access rule, as a pure function of the path and the session
 * state. Every path is public; a signed-in user who opens an auth page is sent
 * to `/`, because there is nothing left for them to do there.
 *
 * Nothing is private yet. S-03 adds its private paths here when the first
 * private view arrives.
 */
export function decideAccess({
  pathname,
  isSignedIn,
}: {
  pathname: string;
  isSignedIn: boolean;
}): AccessDecision {
  if (isSignedIn && AUTH_PAGES.has(pathname)) {
    return { kind: "redirect", to: "/" };
  }
  return { kind: "pass" };
}
