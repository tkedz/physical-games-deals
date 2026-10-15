---
change_id: testing-main-flow-end-to-end
title: Testing main flow end to end
status: implementing
created: 2026-10-14
updated: 2026-10-15
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-10-15 — Phase 1

- **The local stack accepts `example.com`.** `TEST_EMAIL_DOMAIN` stays as planned. A throwaway account went through create, a second create ("already exists", GoTrue's `email_exists`), delete and a second delete ("nothing to delete"). No line printed the address or the password.
- **Beyond the contract in `scripts/e2e/accounts.mts`:**
  - every error it throws is a `TestAccountError`, whose message can be printed safely (a fixed text, a refusal naming only a host, or the Auth error code in `.code`), so the CLI prints only that, and only the class name of any other error;
  - it also exports the `E2eAdminClient` type;
  - `findTestAccountId` counts the `listUsers` pages itself (1000 per page, until an empty page), because auth-js 2.116.0's `nextPage` reads only the first digit of the page number;
  - the generated password is 24 ASCII characters, with symbols from the subset `!*-._~` of the rule's set, which needs no quoting in an env file.
- **CLI lines start with the outcome.** Each line is "created: …", "already exists: …", "deleted: …" or "nothing to delete: …", and names the variable `E2E_USERNAME`, never its value. On "already exists" the account keeps its old password, which the line says.
- **Deliberate breaks.** Each was a worktree-only edit, restored from the index. With `refuseE2eTarget`'s `hosted` branch disabled, 4 unit rows failed. With the generator's one-of-each characters removed, the 200-sample rule row failed. With the missing-key check disabled, 2 rows failed.

### 2026-10-15 — Phase 2

- **The self-seed also asks for a unique title.** The plan says to take the first card whose title has 3–100 characters. The spec takes the first one whose title also appears on no other card of `/`, because the snapshot lists different deals under one title (two „Limitowana Edycja Kolekcjonerska Halloween The Game” cards), and the `/my-deals` card is located by its title. On the seed and on today's snapshot, the pick is still D1.
- **The price is found by its shape.** The card has no label for the price, so the spec finds it by a text pattern (`PRICE`, digits, a comma, two digits, a currency) inside the card. It compares the link targets as the ordered list of `href`s.
- **No shared helper.** The sign-in hydration proof is copied from `auth.setup.ts`, which this change may not edit, so no helper file is shared. Sign-out is pressed until the header offers „Zaloguj się”, and only while its button is still there, because the button does nothing before the page hydrates.
- **The fixture's callback is named `provide`.** The React hooks lint rule takes a call named `use` for React's `use()`.
- **Exploration ran as a throwaway account.** The account was created with `npm run e2e:account`, signed in through the `setup` project, and deleted afterwards. The shared E2E user never added an entry.
- **Evidence.**
  - 2.1: on the build `webServer` runs, a search showed „Katalog gier jest chwilowo niedostępny” and `Obserwuj frazę „Gra Elden Ring PS5 Pudełkowa”`, and the server logged `misconfigured`.
  - 2.2 and 2.3: green alone in about 6 s, and three parallel attempts green in about 10 s each.
  - 2.4: with `loadMatchedDealsPage` returning no rows, the spec failed at the matched card (`toBeVisible`, step 6).
  - 2.5: with sign-out deleting the `sb-` cookies in the browser and never calling Auth, it failed at step 9: the replayed cookies opened `/my-deals`. On unbroken code the same replay lands on `/login`, so GoTrue rejects a revoked session's token. That settles the plan's open question.
  - 2.6: after every run, each attempt's annotated address reported "nothing to delete".
  - 2.9: Tomasz watched a headed run slowed to 800 ms per action and confirmed the flow. The slowdown came from a temporary config that imported `playwright.config.ts` and added only `launchOptions.slowMo`; it was deleted after the run. UI mode (`--ui`) was tried first: it lists only the `setup` project until `chromium` is ticked, runs headless, and showed him no steps.

### 2026-10-15 — Phase 3

- **One sentence beyond the plan's env-step comment.** The default `run:` shell is `bash -e` without `pipefail`, so a failed `supabase status` leaves `.env.local` empty, and the name check fails the step. The step's commands are the plan's, verbatim.
- **Unnamed steps.** `npm ci`, `local:start`, `local:reset`, `e2e:account`, the browser install and `npx playwright test` are unnamed, like `verify`'s, and their log titles tell them apart. `next build` runs inside the `npx playwright test` step (`webServer`), so its time is read from the build output's timestamps, which the CI-only `stdout: "pipe"` puts in the log.
- **`actions/upload-artifact@v7`.** Its releases page listed v7.0.2 as the latest on 2026-10-15.
- **The env step, proven locally (3.3).**
  - The pipeline into a scratch file gave exactly `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SUPABASE_URL SUPABASE_SECRET_KEY`, so CLI 2.117.0 names the secret key `SECRET_KEY`.
  - `process.loadEnvFile` read all three without quotes, and the URL is loopback http.
  - Its stderr reaches the CI log unscreened. Locally it held four lines and no `sb_secret_`, `sb_publishable_` or `eyJ`: an npm config warning, the stopped services' names, the CLI's update notice and a docs URL.
- **The per-run user, proven locally (3.4).** The step's two lines were appended to a copy of that file, which was loaded into the environment. `npm run e2e:account` then printed "created", "deleted" and "nothing to delete", with no credential.
- **The branch-protection caveat** (`ci.yml:17-19`) still names only `verify`. It now holds for `e2e` too, and stays as written, as the plan says.
- **The first pull request, from the branch `testing-main-flow-end-to-end` at `431e088` (3.5, 3.6).**
  - `e2e` ran green: 3 tests passed in 41.8 s, and `deploy` made a preview.
  - Times, read from the log archive:
    - `verify` took 52 s;
    - `e2e` took 4 min 20 s, beside it: `npm ci` 33 s, `local:start` 2 min 06 s, `local:reset` 21 s, the env step 2 s, `e2e:account` 1 s, the Chromium install 26 s, and `npx playwright test` 43 s, of which `next build` plus start took 29 s and the tests 11 s;
    - `deploy` started 6 s after `e2e` ended and took 1 min 28 s.
  - So a pipeline run lasts about 6 minutes, of which `e2e` adds about 3.5 minutes beyond `verify`. The plan estimated 6–10 minutes for the job.
  - No log file of the run holds `sb_secret_`, `sb_publishable_` or `eyJ`. `local:start` printed the two URLs and held back 11 lines.
- **The red pull request, from the throwaway branch `e2e-gate-break` (3.7).**
  - The first break was Phase 2's break 1 as written: `loadMatchedDealsPage` returned an empty page. Its three unused parameters failed `verify` through ESLint's `--max-warnings 0`. With `verify` red, `deploy` is skipped whatever `e2e` says, so that run proved nothing about `e2e`.
  - The break that counts asks `public.matched_deals` for a page past the end (`page + 1000`). It passes ESLint, Prettier and tsc, and no unit or db test calls the function. Locally it failed the spec at the same assertion before it was pushed.
  - On that run:
    - `verify` passed;
    - `e2e` failed the main flow on all three attempts at the matched card (`main-flow.spec.ts:160`), while setup and seed passed;
    - `deploy` never ran: the log archive has no `deploy` log;
    - the `playwright-report` artifact held a screenshot per attempt, showing „Brak okazji na gry z Twojej listy” under the signed-in header, plus the first retry's trace;
    - no log file held a key mark.
  - The branch was never merged; the pull request was closed and the branch deleted.
- **To `main` without a merge (3.8).** Both pull requests were closed and both branches deleted, so nothing was merged. Local `main`, which the green pull request carried exactly, was then pushed as a fast-forward (`e97ec1a..431e088`, 09:36:07 UTC), so the commits' SHAs stayed as Progress records them. A new production deployment, `dpl_HwShXeuyj9HmjpCKBSBiFTj76yba`, went Ready 5 min 34 s later. `deploy` needs `verify` and `e2e`, so both passed on `main`. Production then answered `/` and `/login` with 200, and sent a guest from `/my-deals` and `/watchlist` to `/login`.

### 2026-10-15 — Phase 4

- **Test-plan §6.5 beyond the contract.** It also names the hydration traps of sign-in and sign-out, the fixture callback that may not be called `use`, `--repeat-each=3`, and what `--headed` and UI mode show. Under CI it adds that a gate-proving break must pass `verify`. A third known gap is the retry trace in the report artifact, which can carry the local publishable key and the throwaway account's sign-in and tokens. The header's "Last updated" stays as it was, as in the earlier cookbook commits; only `/10x-test-plan` moves it.
- **CLAUDE.md beyond the contract:**
  - the Verification bullet also states that a pass on a retry fails the run in CI (`failOnFlakyTests`), and points to §6.5;
  - the Local stack line also states the env step's three-name filter;
  - the Secrets list now says "credential-loading commands", not "scripts", because `npx playwright test` is not an npm script.
- **Left as they are.** These are not false, so they stay unchanged: CLAUDE.md's Supabase bullet, which names `createCollectorClient()` and `next.config.ts` as the callers of `refuseSupabaseTarget` and does not name `refuseE2eTarget`; and `.env.example`, which says to create the E2E user by signing up at `/signup`. Test-plan §1–§5 are left to `/10x-test-plan`, as the plan says, though some of it is now stale: the §3 Phase 5 status, the §4 e2e row ("none yet"), §4's note that Phase 5 research decides where the test runs, and the §5 e2e gate's "Where".
