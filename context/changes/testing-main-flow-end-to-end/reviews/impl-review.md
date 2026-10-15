<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Main Flow End to End

- **Plan**: context/changes/testing-main-flow-end-to-end/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-15
- **Commits**: `542edbe`, `d06f6fd`, `431e088`, `10bec23` (epilogue `dddd9aa`)
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## What was verified, not assumed

Re-run on 2026-10-15 against the local stack, Node 24, port 3000 free:

- `npm test` (22 files, 454 tests, the 64 rows of `tests/unit/env/supabase-target.test.ts` and `tests/unit/e2e/accounts.test.ts` among them), `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass (1.1–1.3, 2.8, 3.1, 4.1).
- `npx playwright test` passes setup, seed and the main flow (1.4, 2.2, 2.8); the server under test logged `misconfigured` for the catalogue search, so it held no RAWG key (2.1).
- `--repeat-each=3` passes three parallel attempts (2.3). Each attempt's `test-data` address then reported "nothing to delete" through `npm run e2e:account -- delete` (2.6).
- `npm run e2e:account` with a throwaway account printed "created", "already exists", "deleted" and "nothing to delete", each exit 0, and no line held the address or the password. With `SUPABASE_TARGET=hosted` it exited 1 with the refusal (1.5, 1.6).
- `ci.yml` parses with js-yaml; `deploy.needs` is `[verify, e2e]` with no `if:`; the `e2e` job references no secret and runs its 11 steps in the planned order (3.2).
- The env step, extracted from `ci.yml` with its output path moved to a scratch file, wrote exactly the three names, unquoted, with a loopback URL, and its stderr held no `sb_secret_`, `sb_publishable_` or `eyJ`. The per-run user step, run on a copy, added the two `E2E_*` names silently, and the account cycled through `npm run e2e:account` (3.3, 3.4). The scratch files were deleted.
- test-plan §6.5 no longer reads "TBD", and CLAUDE.md's Secrets list names `npm run e2e:account` and `npx playwright test` (4.2).
- Not re-run: the deliberate breaks 2.4 and 2.5, which need source edits. change.md records both, and the red pull request of 3.7 proved break 1 again in CI.
- After Phase 1, `plan.md` changed only in its Progress ticks and SHAs; no contract was rewritten after the fact.
- No guardrail was breached: `test-stack.md`, `auth.setup.ts`, `seed.spec.ts`, `database-tests.yml` and test-plan §1–§5 are untouched, and every field `test-stack.md` records in `playwright.config.ts` is as it was.

## Findings

### F1 — Typed passwords reach every HTML report, which the new docs say never happens

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/main-flow.spec.ts:131, .github/workflows/ci.yml:151-156; the statements at main-flow.spec.ts:30-31, ci.yml:148-150, context/foundation/test-plan.md:376-377 and :466-469, CLAUDE.md:97
- **Detail**: Playwright 1.64.1 titles every fill step `Fill "{value}"` (`node_modules/playwright-core/lib/coreBundle.js:4275`, `Frame.fill` with `renderParams: ["value"]`). `renderTitleForCall` (:4534-4539) puts the value in as typed, with no masking, and the test runner titles its steps with it (`node_modules/playwright/lib/index.js:808`). The HTML reporter stores the steps of every result, passing ones included (`node_modules/playwright/lib/runner/index.js:4041`). So every run writes into `playwright-report/`:
  - the attempt's password, from `main-flow.spec.ts:131`;
  - `E2E_PASSWORD` from `.env.local`, from `tests/e2e/auth.setup.ts` (since 2d6f628, a file this change may not edit).

  `ci.yml:151-156` uploads that folder on every run that is not cancelled, green ones included, for 14 days. Five statements say otherwise:
  - `main-flow.spec.ts:30-31` and `test-plan.md:376-377`: the password "never is" / "never does" recorded — true of the annotation only;
  - `test-plan.md:466-469`: the accepted gap names only "a traced retry";
  - `ci.yml:148-150`: the files holding credentials lie outside the uploaded path;
  - `CLAUDE.md:97`: `npx playwright test` loads `.env.local` "while nothing reads or prints its contents", yet the report writes one of its values to disk.

  In CI this harms nothing: every credential in the artifact belongs to a stack destroyed with the job, in a private repository. Locally, `playwright-report/` (gitignored, on disk) holds the local `E2E_PASSWORD`, and nothing marks the report folders as holding credentials — the `.gitignore` comment (:62-63) names `playwright/.auth/` and `.playwright-cli/` only. An agent that opens a failed run's report (`npx playwright show-report`, playwright-cli, or a read of `test-results/`) prints that password into the conversation.
- **Fix**: Correct the five statements, and declare the report folders as holding credentials.
  1. CLAUDE.md Secrets: `playwright-report/` and `test-results/` are never opened by an agent, because every `fill` value is a step title.
  2. The `.gitignore` comment at :62-63 names them too.
  3. `main-flow.spec.ts:30-31` and `test-plan.md:376-377`: the annotation never carries the password; the report does.
  4. `test-plan.md:466-469`: the accepted gap covers every report, not only a traced retry.
  5. `ci.yml:148-150`: the uploaded folder holds the typed passwords of the run's throwaway accounts.
  - Strength: The Secrets section, the project's strictest rule, then covers every place the E2E run writes a credential, and the docs stop promising what Playwright does not do.
  - Tradeoff: Wording in five files, one of them the rules file; the run itself does not change. Uploading the report only on failure was left out: the plan keeps it on every run, and the CI credentials die with the job.
  - Confidence: HIGH — read in the installed Playwright 1.64.1 source, step template to reporter.
  - Blind spot: `playwright-report/` was not opened to see the strings, on purpose. Whether the failure snapshot in `test-results/` shows a password field's value was not checked.
- **Decision**: FIXED — not as proposed. Tomasz pointed out that the proposed ban would keep agents out of the reports they need to diagnose a red test. Three variants were weighed: ban both folders, ban only the parts that hold a password, or declare the test passwords not secret. He chose the third, which was offered on the condition that `E2E_PASSWORD` serves only the local-stack test account.
  - The blind spot is settled: `error-context.md` does show a password field's value. Playwright's page snapshot writes the value of every `input` other than a checkbox, a radio or a file.
  - `CLAUDE.md` Secrets gains a point. `npx playwright test` writes what the tests type into `playwright-report/` and `test-results/` (step titles, `error-context.md`, traces), `E2E_USERNAME`, `E2E_PASSWORD` and the throwaway passwords included. These are local-stack test credentials and not secrets, so agents may open both folders. Of `.env.local`'s other values, only the public `NEXT_PUBLIC_*` ones reach them.
  - `main-flow.spec.ts:30-32`, `test-plan.md:376-381` and `ci.yml:148-152` now say the report shows the typed password. The known gap at `test-plan.md:466-470` covers every report's step titles, not only a traced retry.
  - `.gitignore` is unchanged: none of it is false under this decision.

### F2 — A same-titled deal further down `/` turns the test red on local data

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/main-flow.spec.ts:100-104, :159-160
- **Detail**: The self-seed checks the title is unique among the 30 cards on page 1 of `/` (`PAGE_SIZE`, `src/lib/deals/page.ts:11`), the departure change.md records. `/my-deals` lists every listed deal the phrase matches. A deal with the identical title beyond page 1 of `/` — a repost of the newest deal, say — makes `dealCard` resolve to two cards, and `toBeVisible` at :160 fails with a strict-mode violation. It cannot pass wrongly, because price and links must still match. It cannot happen on the CI seed; locally it needs such a duplicate, most likely after a local collect and extract put real deals above the seed's D1.
- **Fix**: In step 6, assert that one of the cards titled `title` carries the recorded price and link targets (collect each card's pair, then `toContainEqual`), instead of requiring a single card.
- **Decision**: FIXED — as proposed. Step 6 (`main-flow.spec.ts:156-173`) now collects the price text and link targets of every card titled `title` on `/my-deals`, and asserts that the pair recorded on `/` is among them. The doc of `dealCard` now speaks of cards. Two breaks of `loadMatchedDealsPage` proved it, each made in the worktree only and restored from git:
  - With no rows (`page + 1000`), the spec failed at :163.
  - With every matched deal listed twice (the twin under `-id`), the fixed spec passed. The committed step 6 failed on the same break with `strict mode violation … resolved to 2 elements` at its :160.
  - On today's local data the spec passes.

### F3 — The account lookup can loop forever

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/e2e/accounts.mts:227-235
- **Detail**: `for (let page = 1; ; page += 1)` ends only on an empty page or a match. GoTrue honours `page`, so a real stack ends the walk; a server or proxy that ignored it would return page 1 forever. In the spec's teardown the fixture timeout stops it; `npm run e2e:account -- delete` has no timeout at all.
- **Fix**: Cap the walk (100 pages is 100,000 accounts) and throw a `TestAccountError` past it.
- **Decision**: FIXED — as proposed. `MAX_PAGES = 100` in `scripts/e2e/accounts.mts`. Past it, `findTestAccountId` throws "Looking up the test account failed: the user list did not end within 100 pages."
  - A new unit row covers a list that never ends: the lookup stops after exactly 100 requests. All 20 rows pass.
  - Against the local stack, `npm run e2e:account -- delete` still reports "nothing to delete".
  - No deliberate break was run: without the cap, the stand-in client answers at once, so the loop would never yield to the test's timeout and Vitest would hang.

### F4 — Three statements about the E2E run are false or overstated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: playwright.config.ts:9-10, .github/workflows/ci.yml:83-85, context/foundation/test-plan.md:423-425
- **Detail**: Phase 3's comment contract is to keep the comments true. These three are not, and change.md does not list them.
  - `playwright.config.ts:9-10`: "In CI the file is absent and the variables come from the job." Since Phase 3 the job writes `.env.local` and line 11 loads it. The sentence points a reader at the job-env route the plan rules out ("No `$GITHUB_ENV` route for the keys").
  - `ci.yml:83-85`: the build "inside the run" comes on top of the 15-minute `globalTimeout`. Playwright starts the `webServer` under the same deadline (`runTasks(…, globalTimeout)` at `node_modules/playwright/lib/runner/index.js:7150` runs `createGlobalSetupTasks`, which holds `createPluginSetupTasks`), so `next build` counts toward the 15 minutes. Harmless at 29 s.
  - `test-plan.md:423-425`: the run "refuses any other target". The guard checks only the Playwright process's own environment; outside CI a reused server on port 3000 is tested whatever it targets, `npm run dev:hosted` included. The next bullet mentions reuse, not the hosted case. Nothing is written to the hosted project then, since the attempt's account exists only locally and its sign-in fails, but the sentence overstates the guard.
- **Fix**: Reword the three: the CI job writes `.env.local` too; the build counts toward the 15 minutes; a reused server's target is not checked, so stop `npm run dev:hosted` or set `E2E_PORT`.
- **Decision**: FIXED — as proposed, text only.
  - `playwright.config.ts:9-10`: in CI the e2e job writes the file from the stack it starts.
  - `ci.yml:83-85`: the build inside the test run counts toward the 15 minutes.
  - `test-plan.md:423-428`: the run refuses any other target in its own environment, and a server reused on the port is unchecked, `npm run dev:hosted` included.
  - Prettier, ESLint and the YAML parse still pass.

### F5 — The post-edit hook runs no unit tests for `scripts/e2e/`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .claude/hooks/post-edit-tests.mjs:49-57
- **Detail**: `SUITE_PATHS.unit` lists `scripts/extract/`, `scripts/local/`, `src/lib/deals/`, `src/lib/env/`, `src/lib/watchlist/` and `tests/unit/`, but not `scripts/e2e/`, which `tests/unit/e2e/accounts.test.ts` now covers. local-supabase-stack registered each new unit-tested folder (`scripts/local/` in 3c654c3, `src/lib/env/` in e97ec1a). An edit to `accounts.mts` runs its tests only at the end of the turn. `src/lib/auth/`, which the new test imports, is missing too, from before this change.
- **Fix**: Add `scripts/e2e/` (and `src/lib/auth/`) to `SUITE_PATHS.unit`.
- **Decision**: FIXED — as proposed. `SUITE_PATHS.unit` now lists `scripts/e2e/` and `src/lib/auth/`.
  - The hooks project passes, 47 of 47.
  - The handler was fed a PostToolUse input by hand. For `scripts/e2e/accounts.mts` and `src/lib/auth/credentials.ts` it ran the unit project (about 1.7 s, exit 0). For `scripts/collector/supabase.mts`, which is still unmapped, it returned in 0.26 s without starting Vitest.

### F6 — The CLI's two exit-0 outcomes cannot be unit-tested

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/e2e/account.mts:45-68
- **Detail**: `create` turns `email_exists` into "already exists" with exit 0, and `remove` turns a missing account into "nothing to delete". Both already take the client as a parameter, but they live in the file that calls `main()` on import, so no test can load them, and change.md records only a manual check. The scripts/local split keeps such decisions in a module without side effects (`commands.mts`, covered by `tests/unit/local/commands.test.ts`), as lessons.md's "Separate logic from I/O" asks.
- **Fix**: Move `create` and `remove` into `accounts.mts` and cover both exit-0 paths with the stubbed `fetch` `tests/unit/e2e/accounts.test.ts` already uses.
- **Decision**: FIXED — as proposed. `create` and `remove` moved to `scripts/e2e/accounts.mts` as `createAccountCommand` and `deleteAccountCommand`, with their printed lines unchanged. `account.mts` now only reads the variables and calls them, and the module header says why they live there.
  - A new block in `tests/unit/e2e/accounts.test.ts` covers them with the stand-in client:
    - create on a new account and on a taken address;
    - create failing on any other Auth error;
    - delete of an account it finds, and of none.

    Each line is matched and holds neither the address nor the password. All 25 rows pass, and ESLint, Prettier and `tsc` are clean.
  - Break: `createAccountCommand` was made to expect another code in place of `email_exists`. Exactly the taken-address row failed, and the post-edit hook caught it, which proves F5's mapping too. The break was reverted.
  - On the local stack `npm run e2e:account` printed "created", "already exists", "deleted" and "nothing to delete", each with exit 0, and none of the lines held the address or the password. With `SUPABASE_TARGET=hosted` it still exits 1.

### F7 — Two unit-test claims the tests cannot back

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/e2e/accounts.test.ts:5-7, :48-49, :136, :149, :159
- **Detail**:
  - The header says the 8–72 byte bounds of `credentials.ts` are "imported here rather than copied, so a change to the rule shows up as a failure". Lines 48-49 hardcode 8 and 72; only `hasRequiredCharacters` is imported, so a change to the bounds would not show up.
  - The "before any request" rows check `fetchSpy` synchronously, right after the call. In the refusal rows the throw comes before `createClient`, so the spy cannot have been called; in "builds a client" a request fired asynchronously during start-up would land after the check. The ordering holds, but the synchronous throw proves it, not the spy.
- **Fix**: Check the generated passwords through `signUpSchema.safeParse({ email, password, passwordRepeat: password })`, and flush a macrotask before the spy checks (or drop the spy claim).
- **Decision**: FIXED. The first point was fixed as proposed. The second was narrowed after a correction to this report: the refusal rows' spy checks are sound, because `fetch()` is called synchronously and a request started before the throw would reach the spy. Only the "builds a client" row could miss a request sent asynchronously while the client starts up.
  - The sign-up row checks each of the 200 passwords with `signUpSchema.safeParse` from `credentials.ts` and expects no issues. The header now names `signUpSchema`.
  - The "builds a client" row awaits `client.auth.getSession()` before checking the spy. That call waits for the client's start-up to finish.
  - Two breaks, each reverted:
    - A factory that sent `fetch(url)` from a microtask passed the old row and failed the new one.
    - A generator without its one character from each set failed the sign-up row, which named the rule that broke.
  - All 25 rows pass, and ESLint, Prettier and `tsc` are clean.

## Dimensions that came back clean

- **Scope Discipline** — no guardrail breached. The additions beyond the contracts (`TestAccountError`, the exported `E2eAdminClient` type, the self-counted pages, the unique-title self-seed, the extra §6.5 and CLAUDE.md content) are each recorded in change.md under lessons.md's departure rule, and none adds surface the plan ruled out.
- **Architecture** — the secret-key client lives in `scripts/e2e/`, outside `src/`; nothing in `src/` reads `SUPABASE_SECRET_KEY` or `E2E_*`. `refuseE2eTarget` runs before the key check and before `createClient`, on the URL the client then uses, and `playwright.config.ts` refuses the same way. The pure parts (password, address, refusal) are separate from the admin requests.
- **Success Criteria** — every automated criterion that needs no source edit was re-run green (see above). Manual 2.9 and 3.5–3.8 carry evidence in change.md: the headed run, the CI times, the red pull request with `deploy` absent, and the production deployment ID. Manual 4.3 is a confirmation by Tomasz with no note in change.md.
