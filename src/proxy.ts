import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/session";

/**
 * Next 16 replaced the `middleware` convention with the `proxy` convention
 * (node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
 * The Supabase docs still show `middleware.ts` — it is the same mechanism.
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
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
