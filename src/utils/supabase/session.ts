import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request. Called from src/proxy.ts.
 *
 * This is the file the Supabase docs call `utils/supabase/middleware.ts`.
 * Renamed because in Next 16 the `middleware` convention is called `proxy`.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
        },
      },
    },
  );

  // This call is the whole point of the file: without it the token is never
  // refreshed and the user gets logged out once the session expires, with no
  // message at all. It must sit immediately after the client is created —
  // code inserted before it can cause random logouts that are hard to trace.
  await supabase.auth.getUser();

  // Return exactly this object. If you ever need to build your own response
  // (a redirect, say), copy the cookies onto it:
  //   const response = NextResponse.redirect(url)
  //   supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c))
  // Otherwise the browser and the server disagree about the session state.
  return supabaseResponse;
}
