import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/session";

/**
 * Next 16 replaced the `middleware` convention with the `proxy` convention
 * (node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
 * The Supabase SSR guide uses `proxy.ts` here too, and warns that on Next 15
 * and earlier the file is never called, so sessions silently stop refreshing.
 * Do not rename this back to `middleware.ts`.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets. Add exceptions here once there are
     * resources for which refreshing the session is a pointless cost.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
