/** What the proxy does with a request: let it through, or redirect it. */
export type AccessDecision =
  { kind: "pass" } | { kind: "redirect"; to: "/" | "/login" | "/my-deals" };

// Exact, case-sensitive matches with no sub-paths: `/login/extra` and
// `/LOGIN` are different URLs from the auth pages, so they pass through.
const AUTH_PAGES: ReadonlySet<string> = new Set(["/login", "/signup"]);

// The views only a signed-in user may open, matched the same way.
const PRIVATE_PAGES: ReadonlySet<string> = new Set(["/my-deals"]);

// The watchlist's old address, matched the same way. The list moved into
// `/my-deals` (game-search-and-pages), and old links and bookmarks still
// lead there.
const MOVED_WATCHLIST = "/watchlist";

/**
 * The proxy's access rule, as a pure function of the path and the session
 * state:
 * - a signed-in user who opens an auth page, `/login` or `/signup`, is sent to
 *   `/`, because there is nothing left for them to do there;
 * - `/watchlist`, where the list lived before it moved into `/my-deals`, sends
 *   a signed-in user to `/my-deals`, and a visitor straight to `/login`,
 *   without a second hop through `/my-deals`;
 * - a visitor who opens the private page, `/my-deals`, is sent to `/login`;
 * - every other path is public.
 *
 * The proxy redirects through updateSession's redirectTo
 * (src/utils/supabase/session.ts), so the refreshed cookies and the cache
 * headers go with every redirect, and the status is NextResponse.redirect's
 * default, 307. The redirect is a first filter, not the boundary: a private
 * view checks the user again where it reads or writes, and RLS guards its
 * rows.
 *
 * A Server Action call to `/my-deals` or `/watchlist` passes, even signed out.
 * Redirected, its POST would land on `/login` and come back as a response the
 * client cannot read, so the user would see an error page. Each action checks
 * the user itself instead, and sends a visitor to `/login`.
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
  if (!isServerAction && pathname === MOVED_WATCHLIST) {
    return { kind: "redirect", to: isSignedIn ? "/my-deals" : "/login" };
  }
  if (!isSignedIn && !isServerAction && PRIVATE_PAGES.has(pathname)) {
    return { kind: "redirect", to: "/login" };
  }
  return { kind: "pass" };
}
