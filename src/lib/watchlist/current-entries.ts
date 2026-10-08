import "server-only";

import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { loadActiveEntries, type ActiveEntriesResult } from "./queries";

/**
 * The signed-in user's active entries for this request. The list and the
 * search's "on the list" checks both ask, and React `cache` keeps them to one
 * query per render, as getCurrentUser does for the session
 * (src/lib/auth/current-user.ts). Every render reads afresh, the one a Server
 * Action's refresh() asks for included.
 *
 * It does not check the user: the sections that call it do, first, and render
 * nothing without one. Without a session the read would run as `anon`, which
 * holds no privilege on the table, and fail.
 *
 * `server-only` needs no package, as current-user.ts explains.
 */
export const getActiveEntries = cache(async (): Promise<ActiveEntriesResult> =>
  loadActiveEntries(await createClient()),
);
