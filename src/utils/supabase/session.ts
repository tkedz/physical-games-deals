import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request. Called from src/proxy.ts.
 *
 * This is the file the Supabase docs call `utils/supabase/middleware.ts`.
 * Renamed because in Next 16 the `middleware` convention is called `proxy`.
 */
export async function updateSession(request: NextRequest): Promise<{
  /** supabaseResponse, to be returned untouched when the request passes. */
  response: NextResponse;
  /** The user from the getUser() call below, or null when signed out. */
  user: User | null;
  /** The only sanctioned way to redirect: keeps the session intact. */
  redirectTo: (pathname: string) => NextResponse;
}> {
  let supabaseResponse = NextResponse.next({ request });
  // The cache headers from setAll, recorded for redirectTo(). The library
  // passes them with the first cookie write only and an empty object after
  // that, so later writes are merged in rather than replacing them.
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // Cache headers the library sends with the cookie write. Without
          // them a CDN may cache a response carrying refreshed tokens and
          // serve one user’s session to another. See the SetAllCookies
          // docs in @supabase/ssr.
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
          cacheHeaders = { ...cacheHeaders, ...headers };
        },
      },
    },
  );

  // This call is the whole point of the file: without it the token is never
  // refreshed and the user gets logged out once the session expires, with no
  // message at all. It must sit immediately after the client is created —
  // code inserted before it can cause random logouts that are hard to trace.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A request that passes gets exactly `response`, which is supabaseResponse
  // with any refreshed cookies on it. A redirect must come from redirectTo(),
  // never from a hand-built NextResponse.redirect(): a fresh response lacks
  // the refreshed cookies, so the browser and the server disagree about the
  // session state, and it lacks the cache headers above.
  return {
    response: supabaseResponse,
    user,
    // Reads supabaseResponse and cacheHeaders when called, not when created,
    // because setAll replaces both. Copies every cookie with its options, and
    // only the cache headers: supabaseResponse also carries Next's internal
    // `x-middleware-*` headers, which do not belong on a redirect.
    redirectTo: (pathname) => {
      const redirect = NextResponse.redirect(new URL(pathname, request.url));
      supabaseResponse.cookies
        .getAll()
        .forEach((cookie) => redirect.cookies.set(cookie));
      Object.entries(cacheHeaders).forEach(([key, value]) =>
        redirect.headers.set(key, value),
      );
      return redirect;
    },
  };
}
