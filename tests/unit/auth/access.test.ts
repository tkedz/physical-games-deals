/**
 * decideAccess (src/lib/auth/access.ts): the proxy's access rule, as a table
 * of path × session state × Server Action call. A row it gets wrong either
 * opens the private view to visitors, logs a signed-in user out of where they
 * meant to go, or answers a visitor's Server Action call with a page the
 * client cannot read.
 *
 * The expected values come from:
 * - CLAUDE.md, Supabase: every path is public except `/my-deals`; signed-in
 *   users are sent from `/login` and `/signup` to `/`, signed-out users from
 *   the private view to `/login`; Server Action calls pass the proxy, so every
 *   action checks the user itself;
 * - the plan (context/changes/game-search-and-pages/plan.md, Phase 5):
 *   `/watchlist` sends a signed-in user to `/my-deals` and a visitor to
 *   `/login` directly, a Server Action POST passes, and `/watchlist/x` and
 *   `/WATCHLIST` pass, matched exactly as the auth pages are;
 * - the `watchlist-from-catalog` change log: a visitor's Server Action POST
 *   to a private page, redirected, answered with the error screen.
 */
import { describe, expect, it } from "vitest";
import { decideAccess, type AccessDecision } from "@/lib/auth/access";

type Row = {
  name: string;
  pathname: string;
  isSignedIn: boolean;
  isServerAction: boolean;
  decision: AccessDecision;
};

const PASS: AccessDecision = { kind: "pass" };

function redirectTo(to: "/" | "/login" | "/my-deals"): AccessDecision {
  return { kind: "redirect", to };
}

describe("decideAccess", () => {
  it.each<Row>([
    {
      name: "CLAUDE.md: a signed-in user on /login goes to /",
      pathname: "/login",
      isSignedIn: true,
      isServerAction: false,
      decision: redirectTo("/"),
    },
    {
      name: "CLAUDE.md: a signed-in user on /signup goes to /",
      pathname: "/signup",
      isSignedIn: true,
      isServerAction: false,
      decision: redirectTo("/"),
    },
    {
      name: "CLAUDE.md: a visitor on /my-deals goes to /login",
      pathname: "/my-deals",
      isSignedIn: false,
      isServerAction: false,
      decision: redirectTo("/login"),
    },
    {
      name: "plan: a signed-in user on /watchlist goes to /my-deals",
      pathname: "/watchlist",
      isSignedIn: true,
      isServerAction: false,
      decision: redirectTo("/my-deals"),
    },
    {
      name: "plan: a visitor on /watchlist goes to /login directly, not through /my-deals",
      pathname: "/watchlist",
      isSignedIn: false,
      isServerAction: false,
      decision: redirectTo("/login"),
    },
  ])(
    "redirects: $name",
    ({ pathname, isSignedIn, isServerAction, decision }) => {
      expect(decideAccess({ pathname, isSignedIn, isServerAction })).toEqual(
        decision,
      );
    },
  );

  it.each<Omit<Row, "decision">>([
    {
      name: "CLAUDE.md: a visitor on /, the public list of every deal",
      pathname: "/",
      isSignedIn: false,
      isServerAction: false,
    },
    {
      name: "CLAUDE.md: a signed-in user on /",
      pathname: "/",
      isSignedIn: true,
      isServerAction: false,
    },
    {
      name: "CLAUDE.md: a visitor on a game page, which is public",
      pathname: "/games/3498",
      isSignedIn: false,
      isServerAction: false,
    },
    {
      name: "CLAUDE.md: a visitor on /login, to sign in",
      pathname: "/login",
      isSignedIn: false,
      isServerAction: false,
    },
    {
      name: "CLAUDE.md: a visitor on /signup, to sign up",
      pathname: "/signup",
      isSignedIn: false,
      isServerAction: false,
    },
    {
      name: "CLAUDE.md: a signed-in user on /my-deals",
      pathname: "/my-deals",
      isSignedIn: true,
      isServerAction: false,
    },
    {
      name: "watchlist-from-catalog change log: a visitor's Server Action POST to /my-deals",
      pathname: "/my-deals",
      isSignedIn: false,
      isServerAction: true,
    },
    {
      name: "plan: a visitor's Server Action POST to /watchlist, from a page an older deployment served",
      pathname: "/watchlist",
      isSignedIn: false,
      isServerAction: true,
    },
    {
      name: "plan: a signed-in user's Server Action POST to /watchlist",
      pathname: "/watchlist",
      isSignedIn: true,
      isServerAction: true,
    },
    {
      name: "plan: a visitor on /watchlist/x, a sub-path, which no rule names",
      pathname: "/watchlist/x",
      isSignedIn: false,
      isServerAction: false,
    },
    {
      name: "plan: a signed-in user on /watchlist/x",
      pathname: "/watchlist/x",
      isSignedIn: true,
      isServerAction: false,
    },
    {
      name: "plan: a visitor on /WATCHLIST, matched case-sensitively",
      pathname: "/WATCHLIST",
      isSignedIn: false,
      isServerAction: false,
    },
    {
      name: "plan: a signed-in user on /WATCHLIST",
      pathname: "/WATCHLIST",
      isSignedIn: true,
      isServerAction: false,
    },
    {
      name: "a visitor on /my-deals/x, a sub-path of the private page",
      pathname: "/my-deals/x",
      isSignedIn: false,
      isServerAction: false,
    },
    {
      name: "a signed-in user on /login/extra, a sub-path of an auth page",
      pathname: "/login/extra",
      isSignedIn: true,
      isServerAction: false,
    },
  ])("passes: $name", ({ pathname, isSignedIn, isServerAction }) => {
    expect(decideAccess({ pathname, isSignedIn, isServerAction })).toEqual(
      PASS,
    );
  });
});
