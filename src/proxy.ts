import type { NextRequest } from "next/server";
import { decideAccess } from "@/lib/auth/access";
import { updateSession } from "@/utils/supabase/session";

/**
 * Next 16 replaced the `middleware` convention with the `proxy` convention
 * (node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
 * The Supabase SSR guide uses `proxy.ts` here too, and warns that on Next 15
 * and earlier the file is never called, so sessions silently stop refreshing.
 * Do not rename this back to `middleware.ts`.
 *
 * The access rule lives in src/lib/auth/access.ts; this function only applies
 * it to the user that the session refresh already fetched.
 */
export async function proxy(request: NextRequest) {
  const { response, user, redirectTo } = await updateSession(request);

  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    isSignedIn: user !== null,
  });

  return decision.kind === "redirect" ? redirectTo(decision.to) : response;
}

export const config = {
  matcher: [
    /*
     * Every path except static assets. Add exceptions here once there are
     * resources for which refreshing the session is a pointless cost.
     * `/login` and `/signup` must stay matched: the signed-in redirect away
     * from them runs here, and an excluded path is never redirected.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
