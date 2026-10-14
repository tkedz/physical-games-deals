---
change_id: local-supabase-stack
title: Local supabase stack
status: implementing
created: 2026-10-14
updated: 2026-10-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-10-14 — Phase 1

- **Deliberate break (criterion 1.2).** With the `grant` line removed from `20261014111929_grant_collected_posts_to_service_role.sql`, `tests/db/collected-posts-grants.test.ts` failed 8 of 16 cases with `42501 permission denied for table collected_posts`. Those are the four allowed operations, in both models. The plan names only the revoke-by-default case. The hosted case fails too, because the kept `revoke all … from service_role` also strips the default grant. Restored, all 16 passed.
- **Additions to the harness contract** (`tests/db/harness/database.ts`):
  - `NO_DEFAULT_PRIVILEGES = "00000000000000"` names the "before every migration" value;
  - `buildDatabase` refuses a `defaultPrivilegesEnd` that is not 14 digits, because versions are compared as text;
  - the self-test in `tests/db/harness.test.ts` also asserts that a table dated before 2026-10-30 reaches no API role under the option.
- **Migration comment.** It names the call sites by function (`insertPosts`, `loadPending`, `saveExtraction`, …), not by line. `collect` and `collect:import` share `insertPosts`, so the test's on-conflict case covers both.
