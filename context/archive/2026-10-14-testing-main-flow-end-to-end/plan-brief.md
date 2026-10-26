# Main Flow End to End — Plan Brief

> Full plan: `context/changes/testing-main-flow-end-to-end/plan.md`
> Research: `context/changes/testing-main-flow-end-to-end/research.md`

## What & Why

This is rollout Phase 5 of the test plan: one Playwright test of the PRD's primary flow, run as a CI gate that `deploy` waits for. The flow is guest redirect, sign-in, empty state, a watched phrase reaching `/my-deals` with price and link, removal, and sign-out. The test covers risks #1, #4 and #6 in a real browser, where unit and database tests cannot reach.

## Starting Point

Commit 2d6f628 set up Playwright: a config that refuses any target but the local stack, a setup project that signs in, and one seed spec (a guest on `/my-deals` lands on `/login`). There is no CI job. In CI a flaky pass still exits 0, and locally the server under test holds the live RAWG key.

## Desired End State

`tests/e2e/main-flow.spec.ts` walks the whole flow on a fresh account per attempt, which it deletes afterwards. It fails when:
- a watched phrase no longer reaches `/my-deals`;
- sign-out leaves the server session alive;
- a private view opens to guests.

`ci.yml` runs it against a local Supabase stack inside the runner. `deploy` needs `verify` and `e2e`, a flaky pass fails the job, and no key reaches the log.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Executor per phase | 1, 3, 4 `/10x-implement`; 2 `/10x-e2e` | `/10x-e2e` may not change the app `webServer` entry or wire CI, and only Phase 2 is a browser-level risk. | Plan |
| Test account | Fresh account per attempt via the local admin API, deleted afterwards | The empty state holds by construction, retries and parallel runs are safe, and nothing is left behind. | Plan |
| Sign-out proof | UI plus cookies recorded before sign-out, replayed afterwards → `/login` | Catches the review-F1 class: cookies cleared while the server session lives on. | Plan |
| Where E2E runs | Only `ci.yml`, as an `e2e` job beside `verify`; `deploy` needs both | `database-tests.yml` already checks the matching rule on migration-only pushes; E2E-only breakage surfaces on the next code push. | Plan |
| Catalogue in the test | `RAWG_API_KEY: ""` for the server under test | No live RAWG call (test plan §4); the phrase path is deterministic. | Plan + Research |
| Flaky passes | `failOnFlakyTests` in CI, retries kept for the trace | A gate that exits 0 on a flake is not a gate (lessons.md). | Research |
| Seed in CI | `npm run local:start`, then `npm run local:reset` | Screened wrappers proven locally; without a snapshot, reset loads migrations plus `seed.sql`. | Research |
| Keys in CI | Workspace `.env.local` from `supabase status -o env`, filtered by name | The same contract as a local run, and nothing is printed or masked. | Research |
| Test data | Self-seeded from the first deal on `/` | Works on the seed in CI and on snapshot data locally. | Research |

## Scope

**In scope:**
- Playwright gate settings.
- A local-only account module with its CLI (`npm run e2e:account`) and unit tests.
- The main-flow spec with two deliberate breaks.
- The `e2e` job in `ci.yml`.
- Test plan §6.5–§6.6.
- CLAUDE.md facts.

**Out of scope:**
- E2E on pushes that touch only `supabase/**`.
- A RAWG mock.
- Test plan §1–§5, `test-stack.md`, `auth.setup.ts` and `seed.spec.ts`.
- Changes to stack start-up, and CI caches.
- Branch protection.
- E2E against the hosted project.

## Architecture / Approach

The test runs against the local Supabase stack: on Docker locally, inside the GitHub runner in CI.
- In CI the job starts the stack with the repository's screened wrappers and seeds it. It then writes the three needed keys into a workspace `.env.local` and creates a per-run setup user.
- `npx playwright test` builds and starts the app from that `.env.local`.
- The spec creates its own account through `scripts/e2e/accounts.mts`, which is guarded to the local stack and uses the secret key. It drives the flow in Chromium against real Auth, PostgREST and RLS, then deletes the account (cascade removes its watchlist rows).

## Phases at a Glance

| Phase | Executor | What it delivers | Key risk |
| --- | --- | --- | --- |
| 1. Gate settings and test accounts | `/10x-implement` | Strict CI settings, RAWG blanked, account module + CLI + unit tests | Local GoTrue may refuse the `example.com` domain |
| 2. Main-flow E2E test | `/10x-e2e` | `tests/e2e/main-flow.spec.ts`, proven by two deliberate breaks, no residue | GoTrue may not reject the revoked session's token (a risk #6 finding) |
| 3. E2E job in CI | `/10x-implement` | `e2e` job, `deploy` needs it, report artifact; a green PR and a red PR | Stack start-up time and Docker pulls in the runner |
| 4. Cookbook and rules-file facts | `/10x-implement` | Test plan §6.5–§6.6, CLAUDE.md Verification/Secrets/Local stack | — |

**Prerequisites:**
- The local stack runs.
- `.env.local` holds the local stack's `SUPABASE_SECRET_KEY` (the local `npm run collect` already uses it) and the E2E user.
- Port 3000 is free for E2E runs.
- Tomasz pushes branches and opens the pull requests (`gh` is not signed in).
- `context/foundation/test-plan.md` carries uncommitted status edits; the Phase 1 commit leaves them to Tomasz unless he chooses to include them.

**Estimated effort:** about 3–4 sessions. Phase 2 and Phase 3 are the heavy ones; Phase 3 waits on two PR runs.

## Open Risks & Assumptions

- **Unobserved: does local GoTrue reject an unexpired access token after `signOut({ scope: "local" })`?** If it does not, step 9 is a real finding, and the plan stops for a decision instead of weakening the assertion.
- **Unverified: does local GoTrue accept the `example.com` domain?** Phase 1 proves it, or switches the domain and records the change.
- **Unmeasured: the CI time.** It is estimated at 6–10 minutes per pipeline run, beside `collect.yml`'s four-hourly runs and within 2000 free minutes a month; Phase 3 measures it.
- **The `SECRET_KEY` name in `supabase status -o env` output** is taken from research (names only); Phase 3 confirms it locally before relying on it.

## Success Criteria (Summary)

- One local run, and one CI run per pipeline, walk the whole main flow. They go red when the watched deal stops reaching `/my-deals` or sign-out leaves a live server session.
- A pull request with a deliberate break never reaches `deploy`, and its report shows why.
- No test account and no key is left behind, locally or in the CI log.
