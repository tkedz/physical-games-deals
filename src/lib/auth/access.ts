/** What the proxy does with a request: let it through, or redirect it. */
export type AccessDecision =
  { kind: "pass" } | { kind: "redirect"; to: "/" | "/login" };

// Exact, case-sensitive matches with no sub-paths: `/login/extra` and
// `/LOGIN` are different URLs from the auth pages, so they pass through.
const AUTH_PAGES: ReadonlySet<string> = new Set(["/login", "/signup"]);

// The views only a signed-in user may open, matched the same way.
const PRIVATE_PAGES: ReadonlySet<string> = new Set(["/watchlist", "/my-deals"]);

/**
 * The proxy's access rule, as a pure function of the path and the session
 * state. A signed-in user who opens an auth page is sent to `/`, because there
 * is nothing left for them to do there. A visitor who opens a private page,
 * `/watchlist` or `/my-deals`, is sent to `/login`. Every other path is
 * public.
 *
 * The redirect is a first filter, not the boundary: a private view checks the
 * user again where it reads or writes, and RLS guards its rows.
 *
 * A Server Action call to a private page passes, even signed out. Redirected,
 * its POST would land on `/login` and come back as a response the client
 * cannot read, so the user would see an error page. Each action checks the
 * user itself instead, and sends a visitor to `/login`.
 */
export function decideAccess({
  pathname,
  isSignedIn,
  isServerAction,
}: {
  pathname: string;
  isSignedIn: boolean;
  /** Whether the request calls a Server Action, as src/proxy.ts tells it. */
  isServerAction: boolean;
}): AccessDecision {
  if (isSignedIn && AUTH_PAGES.has(pathname)) {
    return { kind: "redirect", to: "/" };
  }
  if (!isSignedIn && !isServerAction && PRIVATE_PAGES.has(pathname)) {
    return { kind: "redirect", to: "/login" };
  }
  return { kind: "pass" };
}
