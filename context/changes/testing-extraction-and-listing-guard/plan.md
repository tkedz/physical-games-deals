# Extraction and Listing Guard Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md` ("Extraction and listing guard", Risks #2 and #5).

It covers three things:

- **The deterministic rules, with unit and database tests:**
  - the stored expiry instant, across the 2026-10-25 and 2026-03-29 clock changes;
  - the row mapping (set, price, discount, link wiring) and listability;
  - the write-time link rule against adversarial post HTML, and the render-time link check;
  - hiding an expired deal on both deals pages.
- **The extraction eval becomes a gate that blocks.**
  - It fails with exit 1 on a breach.
  - On a pass it writes a committed `result.json`, bound to what production sends by a sha256 fingerprint.
  - `npm test` and the extractor both refuse code whose fingerprint differs from the record.
- **A post-edit hook** runs the fast suites for the edited area while an agent works.

Three product changes ride in this phase, by decision of 2026-10-13:

- a one-digit hour (`7:00`) is read as 07:00;
- the write-time link rule also rejects the collected aggregators' sites and URLs carrying userinfo;
- the database hides an expired deal itself: the select policy on `public.deals` and the view `public.matched_deals` gain the expiry term.

## Current State Analysis

- **The model makes the judgements; code cleans, converts, checks one URL and gates listing** (research, *Who decides what*).
  - `scripts/extract/deals.mts` holds `toPrice` (:88-99), `verifyShopUrl` (:133-150), `expiryInstant` (:208-245), `toDealRows` (:253-294) and `isListable` (:300-308). All of them are pure and exported, apart from the private helpers.
  - No test calls any of them. No test calls `dealLinks` (`src/lib/deals/links.ts:44-55`) or `formatExpiry` (`src/lib/deals/format.ts:95-104`) either.
- **Expiry:**
  - The write side handles both clock changes. A one-digit hour fails `TIME` (`deals.mts:199`) and ends the day instead. A date in any other format becomes null, which reads as undated.
  - The read side hides expired deals with one PostgREST filter, `.or("expires_at.is.null,expires_at.gt.…")` (`src/lib/deals/queries.ts:165`). It sits in a `server-only`, unexported function.
  - The select policy `"listed deals are public"` (`supabase/migrations/20260930061813_create_deals.sql:48-50`) and the view `public.matched_deals` (`20261012070050_match_deals_to_watchlist.sql:169`) carry no expiry term. Any other reader therefore sees expired deals.
- **Links:**
  - `verifyShopUrl` keeps a URL only when it is character for character one of the post's hrefs, uses http(s), and is not on the post's own site.
  - It keeps another aggregator's link, a lookalike host and a userinfo URL (research probe).
  - At render, React blocks `javascript:` but passes `data:`, so `links.ts` is the only render-time barrier for `data:`.
- **The eval is a report, not a gate:**
  - It scores through the production `toDealRows` and `isListable` (`scripts/extract/evaluation.mts:541-549`).
  - It exits 0 on leaks: exit 1 happens only on an aborted run (`scripts/extract/eval.mts:529-535`).
  - It runs `CANDIDATES` rather than `MODELS` (`eval.mts:449-450`; `config.mts:8-22`).
  - It compares expiry on the model's raw string (`evaluation.mts:334`).
  - It writes only a gitignored Markdown report, keeps no baseline and repeats nothing.
- **What the eval data lacks or loses:**
  - The labels carry no expiry, no physical set and no link (research, *Composition*).
  - Label items have no id; an item is its index in `label.items` (`evaluation.mts:30-46`).
  - Unmeasured posts drop out of the "missed" denominator (`evaluation.mts:634-645`).
- **Nothing ties a passing run to the code it ran on.** `INSTRUCTIONS` and `AGGREGATORS` in `prompt.mts` are not exported.
  - What production sends is `buildMessages()` (`prompt.mts:290-295`), passed through the private `requestBody` (`scripts/extract/openrouter.mts:327-344`).
  - `requestBody` also carries `models` (the fallback list), `provider: { require_parameters: true }`, `max_tokens` and `temperature`.
- **The extractor runs from `main` on its cron without waiting for CI** (`.github/workflows/collect.yml:10-16`). It installs with `--omit=dev` (`collect.yml:57`).
- **No hooks exist:** `.claude/settings.json` holds permissions only, and `.claude/hooks/` does not exist.

## Desired End State

- **Unit project** — `tests/unit/extract/` and `tests/unit/deals/` cover:
  - the expiry instant, with literal UTC instants;
  - the row mapping, from fixed model outputs;
  - listability;
  - the write-time link rule, over adversarial HTML;
  - the render-time link check;
  - `formatExpiry`;
  - the eval's gate logic;
  - the fingerprints;
  - `MODELS ⊆ CANDIDATES`;
  - the committed eval record.
- **Database:**
  - `public.deals` and `public.matched_deals` hide a deal from its `expires_at` on, for every reader.
  - `supabase/checks/listed-expiry.sql` proves it in PGlite (through `npm test`) and in the hosted SQL editor.
- **`npm run extract:eval`:**
  - runs every candidate twice;
  - exits 1 when a production model leaks, leaves a post unmeasured, or newly misses or gets wrong an item the last passing record got right;
  - on a pass, writes `scripts/extract/eval/result.json`: per-item outcomes without post text, plus the prompt and labels fingerprints.
- **Code that differs from the record is refused:** `npm test` fails, and `npm run extract` aborts before sending anything to the model.
- **The labelled set** gains about eight synthetic posts. The eval then scores set recognition, the stored expiry instant and link choice.
- **The post-edit hook** runs the unit project synchronously and the db project in the background, by path.
- **Docs:** `context/foundation/test-plan.md` §6.1, §6.3 and §6.6 describe the patterns shipped. CLAUDE.md states the new facts.

Verify it by running:

- `npm test`;
- the hosted runs of `listed-expiry.sql` and `matching.sql` ("All checks passed.");
- the gate-proof eval (exit 1) and the real eval (exit 0, `result.json`);
- the one-word prompt edit that `npm test` and the extractor both refuse;
- the next scheduled collect run, whose extract step is green.

### Key Discoveries:

- **The read side's expiry rule is one copy; the listed predicate is four.**
  - The listed predicate is stated in `isListable`, the policy, the view and the query (`queries.ts:138-141` explains why the query restates it).
  - Adding the expiry term to the policy and the view follows the same defence-in-depth pattern. The query's filter stays as the second copy.
- **`create or replace view` resets the view's options.** A PGlite probe on 2026-10-13: a view created `with (security_invoker = true)` had `reloptions` `null` after a replace without the `with` clause. Without `security_invoker` the view runs as its owner and bypasses RLS on `watchlist_entries` (Risk #4). The migration must restate the clause, and the check file asserts it survived.
- **A fingerprint over the whole request body** is the narrowest input that covers everything production sends.
  - It hashes `requestBody()` (exported from `openrouter.mts`) applied to `buildMessages()` of a fixed synthetic post, plus `PROMPT_VERSION`.
  - That covers `INSTRUCTIONS`, the aggregator descriptions, the post formatting, the reply schema, `MODELS` with its order, temperature, max tokens and the provider pin.
  - A comment edit does not change it. A `zod` upgrade that changes `toResponseFormat()` does, and correctly so.
- **Hashing inputs:**
  - Use only `node:crypto`, `zod` and the extract modules, so the extractor can compute it under `--omit=dev`.
  - Hash the labels as parsed JSON, not bytes, so line endings cannot split Windows from CI (`.gitattributes` already pins `eol=lf`).
- **Gate bookkeeping:**
  - Label items are keyed `<postId>#<itemIndex>`, the index into `label.items`. A per-item baseline needs exactly that key.
  - `rankModels` ignores wrong-game and invalid replies (`evaluation.mts:694-722`), so the gate gets its own pure judge rather than reusing eligibility.
- **Where the gate's code and record live:**
  - `extract.mts` aborts through `main().catch` with "Extraction aborted: …" and exit 1 (`scripts/extract/extract.mts:305-310`). A refusal thrown first in `main` (`:197`) reads nothing and sends nothing.
  - `.gitignore:47-51` ignores everything in `scripts/extract/eval/` except `labels.json`.
  - `.prettierignore` does not cover `scripts/`, so an eval-written `result.json` would fail `format:check` unless it is ignored.
- **Hooks** (Claude Code hooks reference, https://code.claude.com/docs/en/hooks — checked: 2026-10-13):
  - `PostToolUse` exit 2 shows stderr to Claude and blocks nothing.
  - Stdout on exit 0 is not shown; `hookSpecificOutput.additionalContext` is.
  - `"asyncRewake": true` runs in the background and wakes Claude on exit 2, with `timeout` enforced.
  - The matcher `Edit|Write` is an exact name list and does not match `NotebookEdit`.
  - Exec form (`"command": "node", "args": [...]`) avoids shell quoting of Windows paths. `${CLAUDE_PROJECT_DIR}` is substituted into `args`.
- **Aggregator hosts** in `scripts/collector/feeds.json`: `www.pepper.pl`, `lowcygier.pl`, `cenograj.pl`.

## What We're NOT Doing

- **No real posts are added to the labelled set** (decision 2026-10-13). The agent writes synthetic posts and Tomasz reviews them. Synthetic posts are tidier than real ones, so they prove less about messy input.
- **No gate on currency, platform or discount.** They stay reported only. The gate covers leaks, unmeasured posts, misses and wrong game, price, expiry, set and link, as Risk #2's guidance names.
- **No measurement of the ≤5% wrong-entry share on the labelled set.** It stays with the sample review of random production posts (`npm run extract:report`), after a change runs (research, correction 1).
- **No lookalike-domain detection and no shop allow-list** (decision 2026-10-13). `https://pepper.pl.evil.example/x` stays a kept off-site link; code cannot tell it from a real shop.
- **No rewrite of stored rows** that already carry another aggregator's link. The rule applies to new extractions.
- **No database `CHECK` on the scheme of `shop_url` or `link`.** The render check covers every stored row.
- **No rendering test of the deal card.** The set guarantee tested is the row's `set_with`. The card's note is UI (test plan §7), and the Phase 5 e2e flow may assert it.
- **No test of the page query's `.or()` filter.** The database is the tested layer; the query keeps its copy untested. A fake Supabase client asserting the filter text would be an implementation mirror.
- **Unreadable date formats other than `H:MM` stay "undated"** (decision 2026-10-13). For example, `30.10.2026` keeps the deal listed.
- **`posts.json` is not in the fingerprint.** It is not in the repository, so CI cannot hash it. `export-posts.sql` makes it reproducible instead.
- **The eval never runs in CI, per commit or from the hook.** It is paid, nondeterministic, and its real post texts are local only.
- **The hook does not cover edits made through Bash, by `NotebookEdit` or by a human.** It is never a CI substitute.
- **No edits to test-plan §1–§5,** including research's corrections to §2 and the §3 status flips. They are left to `/10x-test-plan`. This plan edits §6 only.

## Implementation Approach

Phases are ordered by cost × signal, then by risk.

1. **The hook first.** It is the cheapest phase, and from then on it runs the unit suite after every edit of the phases below.
2. **Write-side listing rules (#2).** Pure functions, literal oracles, one small fix.
3. **The link rule (#5).** Adversarial tables at both ends, plus the aggregator and userinfo rejection.
4. **The expiry term in the database (#2).** One migration, and a check file that runs in PGlite and hosted.
5. **The eval gate's logic.** Fingerprints, the judge, labels that can see sets, expiry and links, and synthetic posts. Everything here is testable without a paid run.
6. **The first passing record and the extractor refusal**, landed together.
7. **The cookbook and rules-file facts.**

The deterministic rule changes (Phases 2–3) land before the first record, because the eval scores through `toDealRows`.

Expected values come from these sources, never from running the code under test or from a model's recorded reply:

- the PRD (Guardrails `prd.md:40-42`, AC3 `:56`, AC4 `:57`, Business Logic `:104`);
- the EU summer-time rule (changes at 01:00 UTC on the last Sundays of March and October);
- the table checks in `create_deals.sql`;
- the slice plan's case lists (`physical-deals-from-real-posts/plan.md:853-867`, inputs only);
- the decisions below.

Decisions taken in planning (2026-10-13):

| Question (research) | Decision | Basis |
|---|---|---|
| OQ1 layer for hiding expired deals | A database condition in the select policy and `matched_deals`; the query keeps its copy | User; any reader is covered, and PGlite tests it |
| OQ2 unreadable dates | Accept `H:MM`; any other unreadable date stays undated (listed) | User; dated deals are rare (2 of 1,162 listed showed one), and hiding would drop valid deals |
| OQ3 off-site vs aggregators | Reject the collected aggregators' sites and URLs with userinfo; lookalikes stay | User; PRD Guardrails: the link leads to the shop or the source post, never another offer |
| OQ4 grow the labelled set | About eight synthetic posts written by the agent, reviewed by Tomasz; labels gain set, link and expiry-instant fields | User |
| OQ6 extractor refuses an unrecorded prompt or model | Yes: `extract.mts` aborts on a prompt-fingerprint mismatch before sending anything | User; the only variant that stops a merged prompt from reaching `public.deals` |
| OQ7 db hook | Background (`asyncRewake`), one run at a time with one trailing rerun; the unit project runs synchronously | User |
| Repeated runs | Two runs per eval; each must pass on its own | Plan; research (k ≥ 2, one run varies), cost ≈ $0.06 per gated eval |
| Baseline | Per model, per item, the gated failures seen in the last passing record. Failures can only shrink. An item absent from the record is new and is accepted on first sight. A new production model is held to its predecessor's record. With no record yet, v3's outcome from `evaluation.md` is the baseline | Plan; test plan #2 "against the last committed passing run" |
| Ambiguous wall time (02:30 on 2026-10-25) | The later occurrence, so a deal is never hidden before the stated time | Plan |

## Critical Implementation Details

- **State sequencing:**
  - `result.json`, its record test and the extractor check land in one commit. A check that reaches `main` before the record stops production extraction at the next cron.
  - The first passing record is made after Phases 2–5 have landed: after the `deals.mts` changes, because the eval scores through `toDealRows`, and after the labels and synthetic posts are final, because the labels fingerprint covers them.
- **The view migration:** restate `with (security_invoker = true)` in `create or replace view public.matched_deals`. Leaving it out silently drops it (PGlite probe above). Grants survive a replace.
- **Formatting:** the eval writes `result.json` in a form Prettier would rewrite. Add it to `.prettierignore`, or `format:check` fails on every record.
- **Hook visibility:** exit 0 stdout never reaches Claude. The eval reminder uses `hookSpecificOutput.additionalContext` on a pass, and is appended to stderr on an exit-2 failure.

## Phase 1: Post-Edit Hook

### Overview

A project hook runs the unit project after an agent edit to the extraction, deals or unit-test paths. It runs the db project, in the background, after an edit to migrations, checks, db tests or the watchlist rules. Every other path costs nothing.

### Gate specification

- **Behaviour:**
  - `PostToolUse`, matcher `Edit|Write`.
  - The script reads `tool_input.file_path`, resolves it against the project root (drive letter compared case-insensitively, backslashes normalised) and picks a suite by path.
  - A failing suite exits 2 with the tail of Vitest's output on stderr. A passing suite or an unrelated path exits 0 silently.
- **Path map** (research, *Post-edit hook*):
  - `scripts/extract/**`, `src/lib/deals/**`, `tests/unit/**` → unit;
  - `supabase/migrations/**`, `supabase/checks/**`, `tests/db/**` → db;
  - `src/lib/watchlist/**` → both;
  - `scripts/extract/{prompt,schema,config,openrouter}.mts` also add a reminder that the change needs `npm run extract:eval` and a new `result.json`.
- **Regression caught:**
  - an edit that breaks a listing, link, fold or matching test is reported in the same agent turn (unit) or as soon as the db run ends (db);
  - a prompt edit is flagged before commit.
- **Edge cases:**
  - a payload without `file_path`;
  - a path outside the project;
  - a lowercase `c:` drive;
  - a db edit while a db run is in progress: the edit triggers one rerun after the current run, never a second parallel PGlite build.
- **Source:** test plan §4 and §5 (hook row, recommended, never a CI substitute); research, *Post-edit hook* (timings: unit 4.3 s wall, db 16.4 s wall); hooks reference, checked: 2026-10-13.
- **When NOT to use:** as a CI substitute, or to run the paid eval (test plan §4).

### Changes Required:

#### 1. Hook script

**File**: `.claude/hooks/post-edit-tests.mjs` (new)

**Intent**: Route one edit to the right suite, run it through the project's own Vitest entry, and report failures in a form Claude sees.

**Contract**:
- `node post-edit-tests.mjs <unit|db>`; reads the hook JSON from stdin.
- The project root is `CLAUDE_PROJECT_DIR`, falling back to the payload's `cwd`.
- Runs `process.execPath` with `["scripts/test.mts", "run", "--project", <suite>]` in the root. This is the entry `npm test` uses, and it needs no `npm.cmd` shim.
- Exit 0: no match, or the suite passed. Exit 2: the suite failed; stderr carries the last ~80 lines of output.
- The eval reminder, for the paths above, goes out in the unit invocation only:
  - on exit 0, as JSON `{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "…"}}`;
  - on exit 2, appended to stderr.
- db single-flight:
  - a lock directory under `os.tmpdir()`, named from a hash of the root and created with `mkdirSync` (atomic);
  - a lock whose owner pid is not alive is taken over;
  - an invocation that finds a live lock writes a rerun marker and exits 0;
  - the lock holder reruns once if the marker appeared, and reports only its final run.
- Plain JavaScript (ESM) with Node built-ins only. It is linted by `npm run lint` (`.claude/` is not in ESLint's ignores) and not formatted by Prettier (`.claude/` is in `.prettierignore`).

#### 2. Hook configuration

**File**: `.claude/settings.json`

**Intent**: Register the two handlers next to the existing permissions.

**Contract**: a top-level `hooks` key. Exec form, so no shell quotes the Windows path:

```json
"hooks": {
  "PostToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-tests.mjs", "unit"], "timeout": 120 },
        { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-tests.mjs", "db"], "asyncRewake": true, "timeout": 300 }
      ]
    }
  ]
}
```

Before writing it, confirm in `skills-lock.json` and `.10x-cli.json` that the 10x CLI does not manage `.claude/settings.json` or `.claude/hooks/`. A sync must not overwrite the hook.

#### 3. Rules file

**File**: `CLAUDE.md`, section **Verification**

**Intent**: State the hook as a fact.

**Contract**: one bullet. After an agent's Edit or Write, `.claude/hooks/post-edit-tests.mjs` runs the unit project (synchronously) or the db project (in the background) for the paths it maps. It is local only and is not a gate. Facts only, no rationale.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with the hook script
- A payload for `tests/unit/watchlist/fold.test.ts` piped into the unit handler runs the unit project and exits 0; the same payload with a lowercase drive letter routes the same way
- A payload for `src/app/page.tsx` exits 0 from both handlers without starting Vitest
- A payload for `supabase/checks/matching.sql` piped into the db handler runs the db project and exits 0
- A deliberately failing assertion in a unit test makes the unit handler exit 2 with the failure on stderr; the assertion is reverted
- Two db handler invocations started together run the db project twice in sequence, never in parallel
- A payload for `scripts/extract/prompt.mts` prints the eval reminder as `additionalContext`

#### Manual Verification:

- In a live Claude Code session in VS Code, an agent edit to a unit-path file shows the hook's result in the transcript, and a deliberately failing db test wakes the agent through `asyncRewake`; both are reverted

**Implementation Note**: After each phase's automated verification passes, pause for the human to confirm its manual items before the next phase. Record any departure from this plan in `change.md` in the commit that makes it (lessons.md).

---

## Phase 2: Write-Side Listing Rules

### Overview

Unit tests for the stored expiry instant, the row mapping from a fixed model output, listability and the expiry display. One fix: a one-digit hour.

### Test specification

- **Behaviour asserted:**
  - **`expiryInstant`:** stated day and hour → the exclusive end instant in Europe/Warsaw, as literal ISO strings the way `toISOString()` writes them. The rows:
    - `2026-10-24` → `2026-10-24T22:00:00.000Z`;
    - `2026-10-25` → `…10-25T23:00:00.000Z`;
    - `2026-10-25 01:59` → `2026-10-24T23:59:00.000Z` (still CEST);
    - `2026-10-25 02:30` → `…10-25T01:30:00.000Z` (ambiguous: the later occurrence);
    - `2026-10-25 03:00` → `…02:00:00.000Z`;
    - `2026-10-25 07:00` and `7:00` → `…06:00:00.000Z`;
    - `2026-03-28` → `2026-03-28T23:00:00.000Z`;
    - `2026-03-29` → `2026-03-29T22:00:00.000Z`;
    - `2026-03-29 01:59` → `…00:59:00.000Z`;
    - `2026-03-29 02:30` (in the gap) → `…01:30:00.000Z`;
    - `2026-03-29 03:00` → `…01:00:00.000Z`;
    - `2026-12-31` → `2026-12-31T23:00:00.000Z`;
    - `2028-02-29` → `2028-02-29T23:00:00.000Z`;
    - `24:00`, `25:00`, `12:60` and `7:5` → end of the stated day;
    - ` 2026-10-25 `, ` 12:00 ` → `…11:00:00.000Z`.
  - **Null results:**
    - `2026-02-29`, `2026-02-30`, `30.10.2026`, `2026-10-5`, no date, and an hour without a date → `null`;
    - `30.10.2026` → `null` is the decided "unreadable date stays undated" rule, named as such.
  - **`toDealRows` (row mapping from a hand-written `ExtractionOutput`, named "row mapping", not extraction):**
    - `set_with` keeps the other games, trimmed and without repeats, and drops the item's own titles whatever their case;
    - a `setWith` naming only the item itself yields `[]` (the documented limit: code cannot invent the other game);
    - both rows of a two-game set keep the set's price undivided;
    - the price is rounded to 2 dp; `zł`, `ZL` and `€` become PLN and EUR; ≤ 0, above 99,999,999.99 or a non-3-letter code null both amount and currency;
    - discount: 29.6 → 30, 0 → null, 100 → null, null → null;
    - `expires_at` and `shop_url` are wired through the two rules.
  - **`isListable`:** true only for a game, a physical copy and a price; digital, unclear, not_game and a null price are each false.
  - **`formatExpiry`:**
    - `2026-09-30T22:00:00.000Z` → "30 września 2026";
    - `2026-10-25T23:00:00.000Z` → "25 października 2026";
    - `2026-03-29T22:00:00.000Z` → "29 marca 2026";
    - `2026-10-25T06:00:00.000Z` → "25 października 2026 07:00".
- **Regression caught:**
  - a fixed `+02:00` offset;
  - an off-by-one day at a clock change;
  - an hour regex that drops `7:00` again;
  - a set row that loses its note data or a divided set price;
  - price or discount cleaning that lets a value the table rejects through, or rejects one it holds;
  - a widened `isListable` that lets `unclear` through.
- **Research source:** *Write side: `expiryInstant`* (probe table); *Sets*; *The cheapest useful layer* (unit, importable); PRD AC3 (`prd.md:56`), AC4 (`:57`), Guardrails (`:40`); `create_deals.sql` checks; `physical-deals-from-real-posts/plan.md:853-862` (inputs).
- **Edge cases:** both clock changes in both directions, the ambiguous and the missing wall time, 24:00, the year rollover, a leap day, whitespace, malformed inputs, an own-title-only set.
- **Anti-pattern avoided:**
  - expected instants computed by `expiryInstant` or by a second implementation;
  - fixtures copied from `report-v3.md`;
  - calling a fixed-output test an extraction test.

### Changes Required:

#### 1. Expiry tests

**File**: `tests/unit/extract/expiry.test.ts` (new)

**Intent**: The table above, one row per case, each named with its source (`PRD AC3`, `EU DST rule`, `decision 2026-10-13`).

**Contract**:
- Import `expiryInstant` from `../../../scripts/extract/deals.mts`, a relative path with the explicit `.mts` (research proved it).
- `describe`, `expect` and `it` from `vitest`.

#### 2. One-digit hour

**File**: `scripts/extract/deals.mts`

**Intent**: Read `7:00` as 07:00. Write the failing rows first, then the fix.

**Contract**: `TIME` accepts one or two hour digits and exactly two minute digits. The `expiryInstant` docstring states `H:MM` and `HH:MM`. Nothing else changes: an invalid hour still ends the day.

#### 3. Row mapping and listability tests

**File**: `tests/unit/extract/deal-rows.test.ts` (new)

**Intent**: The `toDealRows` and `isListable` rows above, from hand-written `ExtractionOutput` and `PostGroup` literals.

**Contract**:
- Import `toDealRows` and `isListable` from `deals.mts`, and types from `schema.mts` and `prompt.mts` (`import type`).
- The suite name says "row mapping (fixed model output)".

#### 4. Expiry display tests

**File**: `tests/unit/deals/format-expiry.test.ts` (new)

**Intent**: `formatExpiry` around both clock changes. The expected strings come from the function's documented examples (`format.ts:89-93`) and the stated-day rule. If the output differs from the documented text, record it as a finding; do not adopt the output as the oracle.

**Contract**: import from `@/lib/deals/format`.

### Success Criteria:

#### Automated Verification:

- The `7:00` rows fail before the `TIME` change and pass after it
- `npm test -- --project unit` passes with the three new files
- `npm test` passes
- `npm run lint` passes
- `npm run format:check` passes
- `npm run build` passes, type-checking the tests that import `.mts` files

---

## Phase 3: The Link Rule at Write and Render Time

### Overview

Adversarial tables for the stored shop link, from post HTML through `postHrefs`, `verifyShopUrl` and `toDealRows`, and for the render-time check in `dealLinks`. One rule change: reject the collected aggregators' sites and URLs with userinfo.

### Test specification

- **Behaviour asserted:** the stored `shop_url` is one of the post's own off-site http(s) links, copied exactly, or `null`, in which case the card links to the post.
  - **Rows → stored value, with a pepper post on `https://www.pepper.pl/promocje/…` unless stated:**
    - `href="https://sklep.example/gra?x=1&amp;y=2"` with the model's `…?x=1&y=2` → kept as written;
    - the model's `…&amp;y=2` → `null`;
    - the model's `https://SKLEP.example/…` → `null`;
    - a URL absent from the post → `null`;
    - `href='javascript:alert(1)'` (single-quoted) → `null`;
    - a bare `href=javascript:alert(1)` → `null`;
    - ` JAVASCRIPT:alert(2)` → `null`;
    - `&#106;avascript:…` → `null`;
    - `&#x6A;avascript:…` → `null`;
    - `java&#x09;script:…` → `null`;
    - `java&#x0A;script:…` → `null`;
    - `data:text/html,…` → `null`;
    - `DATA:…` → `null`;
    - `vbscript:…` → `null`;
    - `mailto:…` → `null`;
    - `ftp://…` → `null`;
    - `/promo` → `null`;
    - `//sklep.example/x` → `null`;
    - `https://www.pepper.pl/x` → `null`;
    - `https://pepper.pl/x` → `null`;
    - `https://m.pepper.pl/x` → `null`;
    - `https://lowcygier.pl/x` → `null` (new);
    - `https://www.cenograj.pl/x` → `null` (new);
    - in a lowcygier post, `https://cenograj.pl/x` → `null` (new);
    - `https://pepper.pl@evil.example/` → `null` (new);
    - `https://user:pass@sklep.example/` → `null` (new);
    - `https://pepper.pl.evil.example/x` → kept (decided: a lookalike cannot be told from a shop);
    - `http://sklep.example/x` → kept;
    - a post whose `link` does not parse → `null`;
    - plain-text content with no `<a>` → `null`.
  - **One row documents the model-side limit:** a two-shop post where the model gives shop B's link to shop A's item keeps it. Pairing is scored by the eval (Phase 5), not here.
  - **Feed drift:** every enabled feed host in `scripts/collector/feeds.json` falls under the aggregator list.
  - **`dealLinks` (stored values):**
    - shop `https://sklep.example/a` with the post link → primary shop, secondary post;
    - shop `javascript:alert(1)`, ` JAVASCRIPT:alert(1)`, `data:text/html,hi`, `vbscript:x`, `blob:https://a.example/1`, `file:///C:/x` or `/relative` → primary post, secondary null;
    - post `javascript:alert(1)` with no shop → no link;
    - post `data:…` with a valid shop → primary shop, secondary null;
    - shop `https://sklep.example/a b` → href `https://sklep.example/a%20b`.
- **Regression caught:**
  - a relaxed membership check (case-insensitive or decoded match);
  - a scheme check moved before entity decoding;
  - a dropped aggregator host;
  - a new feed host the list misses;
  - a render check reduced to `javascript:` only, which React already blocks while `data:` passes.
- **Research source:** *Risk #5* (the probe tables at write and render); PRD Guardrails (`prd.md:42`) and Business Logic (`:104`); `physical-deals-from-real-posts/plan.md:864-867` (inputs only); decision 2026-10-13 (aggregators and userinfo).
- **Edge cases:** entity-encoded, tab- and newline-split schemes; quoting styles; relative and protocol-relative links; an unknown post host; the lookalike row.
- **Anti-pattern avoided:**
  - only well-formed links;
  - expected values computed by `verifyShopUrl` or `webUrl`;
  - testing React's sanitiser (the tests call `dealLinks`, never render).

### Changes Required:

#### 1. Write-time link tests

**File**: `tests/unit/extract/shop-url.test.ts` (new)

**Intent**: The write-side rows, end to end through `toDealRows` with one-item outputs. A smaller table also calls `verifyShopUrl` directly with literal href lists.

**Contract**: HTML fragments as literal strings in the test. Each row names its threat or its source.

#### 2. Aggregator and userinfo rejection

**File**: `scripts/extract/deals.mts`

**Intent**: Write the new rows first, see them fail, then extend `verifyShopUrl`. It also returns null for a URL carrying a username or password, and for a host on any collected aggregator's site (subdomains included), not only the post's own.

**Contract**:
- An exported `AGGREGATOR_SITES` (`["pepper.pl", "lowcygier.pl", "cenograj.pl"]`), checked through `isSameSite`.
- The signature of `verifyShopUrl` is unchanged. The docstring lists the four conditions.
- The prompt is not edited: its own "Never a link to the aggregator" line stays as it is, so the fingerprint does not move.

#### 3. Feed drift test

**File**: `tests/unit/extract/shop-url.test.ts`

**Intent**: Fail when a feed is added whose host `AGGREGATOR_SITES` does not cover.

**Contract**: reads `scripts/collector/feeds.json`, takes each enabled feed's URL host, and asserts that it is the same site as one entry.

#### 4. Render-time link tests

**File**: `tests/unit/deals/links.test.ts` (new)

**Intent**: The `dealLinks` rows above.

**Contract**: import from `@/lib/deals/links`. Expected hrefs are literal strings.

### Success Criteria:

#### Automated Verification:

- The aggregator and userinfo rows fail before the `verifyShopUrl` change and pass after it
- Removing `lowcygier.pl` from `AGGREGATOR_SITES` makes the feed drift test fail; the entry is restored
- `npm test` passes
- `npm run lint` passes
- `npm run format:check` passes
- `npm run build` passes

---

## Phase 4: Expired Deals Hidden by the Database

### Overview

One migration adds the expiry term to the select policy on `public.deals` and to `public.matched_deals`. A check file proves the hide for both relations, in PGlite through `npm test` and hosted in the SQL editor.

### Test specification

- **Behaviour asserted:**
  - As `anon` reading `public.deals`, and as a signed-in user reading `public.matched_deals` with an active entry matching all fixture deals:
    - a deal ending a minute ago is hidden;
    - one ending tomorrow is shown;
    - one with `expires_at` null is shown;
    - one with `expires_at = now()`, inserted and read in the same transaction, is hidden: the column holds the exclusive end.
  - A digital deal ending tomorrow stays hidden, because the other terms still hold.
  - `pg_class.reloptions` of `public.matched_deals` contains `security_invoker=true`.
- **Regression caught:**
  - a later migration restating the policy or the view without the expiry term;
  - `>=` instead of `>`;
  - a view replace that drops `security_invoker`;
  - a reader other than the page query that lists expired deals.
- **Research source:** *Read side: the hide*; Open Question 1; PRD AC3 (`prd.md:56`); `create_deals.sql:76-77` (the column comment: null means the deal stays); `deals.mts:40` (exclusive end); the PGlite probe of 2026-10-13 (view options reset).
- **Edge cases:** the exact boundary instant; null; a non-listable deal with a future end; the view's options after replace.
- **Anti-pattern avoided:** a fake Supabase client asserting the `.or()` filter string; a check that runs as the owner, who bypasses RLS.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_hide_expired_deals.sql` (new, via `npm run db:new -- hide_expired_deals`)

**Intent**: Make "not expired" part of what the publishable key can read, on the table and on the view `/my-deals` reads.

**Contract**:
- **Header:**
  - `-- Revert:` names the `alter policy` back to the three-term predicate and the `create or replace view` with the previous body;
  - one line states the migration is backward-compatible: the deployed query already hides expired deals, so the pages show the same rows, and a rollback deployment reads the same.
- `alter policy "listed deals are public" on public.deals using (kind = 'game' and edition = 'physical' and price_amount is not null and (expires_at is null or expires_at > now()));`
- `create or replace view public.matched_deals with (security_invoker = true) as …`:
  - the current body from `20261012070050_match_deals_to_watchlist.sql:169-…`, with `and (d.expires_at is null or d.expires_at > now())` added to its listed predicate;
  - the same columns in the same order;
  - the `with` clause restated.
- `comment on table public.deals` and `comment on view public.matched_deals`: the listed predicate now includes "not expired".
- No new table, function or grant.

#### 2. Check file

**File**: `supabase/checks/listed-expiry.sql` (new)

**Intent**: The cases above, as one transaction that ends in a deliberate exception carrying the report. This is the convention of `supabase/checks/matching.sql`, so it runs unchanged in PGlite and in the hosted SQL editor.

**Contract**:
- Fixtures as the owner: a `collected_posts`/`post_extractions` row per deal, for the `deals.link` foreign key, and one user with active entries in `watchlist_entries`.
- Reads use `set local role` with `request.jwt.claims`.
- Report lines `ok`/`FAIL` per check. The final message is "Rolled back on purpose. All checks passed." or "N check(s) failed."

#### 3. Test wrapper

**File**: `tests/db/listed-expiry.test.ts` (new)

**Intent**: Run the check file through `runCheckFile` (`tests/db/harness/check-file.ts`), as §6.2(b) describes.

**Contract**: the same shape as `tests/db/matching.test.ts`.

### Success Criteria:

#### Automated Verification:

- `tests/db/listed-expiry.test.ts` fails before the migration file exists and passes after it
- `npm test` passes, `supabase/checks/matching.sql` included, unchanged
- `npm run lint` passes
- `npm run format:check` passes

#### Manual Verification:

- Tomasz: `npm run db:push -- --dry-run` lists only the new migration, then `npm run db:push`
- Tomasz: `npm run db:check` exits 0 and `npm run db:status` shows no drift
- Tomasz: `supabase/checks/listed-expiry.sql` in the hosted SQL editor ends with "All checks passed."
- Tomasz: `supabase/checks/matching.sql` in the hosted SQL editor ends with "All checks passed."
- `/` and `/my-deals` on production still list deals after the push

---

## Phase 5: The Eval Gate's Logic

### Overview

Everything the gate needs that can be built and tested without a paid run:

- the two fingerprints;
- a pure judge with the baseline rules;
- label fields that let the eval see sets, the stored expiry and the link;
- about eight synthetic posts;
- two runs per eval, exit 1 on a breach, and the record writer;
- `MODELS ⊆ CANDIDATES`;
- a reproducible export of `posts.json`.

AI-native guidance in this phase is checked: 2026-10-13 (OpenRouter request shape in `openrouter.mts`; costs from `report-v3.md`).

### Test specification

- **Behaviour asserted:**
  - **The judge fails when:**
    - a production model leaks in either run;
    - a post is unmeasured;
    - a reply comes from another model;
    - a production model was not evaluated;
    - an item has a gated failure (missed, wrong game, price, expiry, set or link) its baseline entry lacks.
  - **The judge passes when:**
    - only a candidate outside `MODELS` leaks;
    - a failure is in the baseline (e.g. #49 missed);
    - an item is new to the record (accepted and recorded);
    - an item improved (recorded as `[]`).
  - **New production model:** a model absent from the record is held to its predecessor's entries.
  - **Scoring:**
    - a set label with an empty row `set_with` is a "set" failure, and a non-set label with a non-empty one is too;
    - a label `shopUrl: null` with a row `shop_url` null is correct;
    - expiry compares instants, so `…T23:00:00Z` equals `…T23:00:00.000Z`.
  - **Fingerprints:**
    - the same inputs give the same hash;
    - one changed character of the messages, a reordered `MODELS`, a different temperature or a different labels file each change it;
    - the labels hash ignores line endings and key spacing.
  - **Refusal check:** a missing, unparsable, non-pass or mismatched record each give a refusal naming the cause and the command to run; a matching pass record is accepted.
  - **Models:** `MODELS` is non-empty and every entry is in `CANDIDATES`.
- **Regression caught:**
  - a gate that exits 0 on a breach (lessons.md);
  - a baseline that silently tolerates new misses;
  - a fingerprint that misses a request field;
  - a production model that was never evaluated.
- **Research source:** *Making the eval a required gate* (options A, B, D; thresholds with sources); *How it scores*; *Cost and nondeterminism*; `evaluation.md:100,126` (v3: #49 missed, 0 wrong game, 0 wrong price for Mistral); this plan's decisions.
- **Edge cases:** a leak in run 2 only; unmeasured posts that would shrink the denominator; an invalid reply (all its items missed); a key present in the baseline with `[]`; the bootstrap without a record.
- **Anti-pattern avoided:**
  - mocking the model and calling it an extraction test (the judge and scoring tests use hand-written outcomes and rows, named so);
  - asserting the model's current replies;
  - the paid eval in CI.

### Changes Required:

#### 1. Request body export

**File**: `scripts/extract/openrouter.mts`

**Intent**: Let the fingerprint hash exactly what production sends, with no second copy of the body's shape. `openrouter.mts` stays the only file that knows OpenRouter's fields.

**Contract**: `export function requestBody<T>(request: CompletionRequest<T>)`, unchanged in behaviour.

#### 2. Fingerprints and the refusal check

**File**: `scripts/extract/fingerprint.mts` (new)

**Intent**: One place that turns the code into the two hashes, and decides whether a record matches.

**Contract**:
- `SAMPLE_GROUP`: a fixed synthetic `PostGroup` literal, invented and never a real post.
- `promptFingerprint(): string`: sha256 hex of the canonical JSON of `{ promptVersion: PROMPT_VERSION, body: requestBody({ messages: buildMessages(SAMPLE_GROUP), models: MODELS, responseFormat: toResponseFormat(), schema: extractionSchema, maxTokens: MAX_TOKENS, temperature: TEMPERATURE }) }`.
- `labelsFingerprint(labelsText: string, syntheticText: string): string`: sha256 of the canonical JSON of both parsed files.
- `checkRecord(recordText: string | null, current: { prompt: string; labels?: string }): { ok: true } | { ok: false; reason: string }`.
- Imports only `node:crypto` and the extract modules, so the collect job (`--omit=dev`) can run it. No file system access; callers read the files.

#### 3. Labels, scoring and the judge

**File**: `scripts/extract/evaluation.mts`

**Intent**: Let the labels state the stored expiry, a set and the expected link. Score the rows against them, and judge a set of runs against a baseline.

**Contract**:
- **Label item:**
  - `expiresOn` becomes `expiresAt`: the expected `expires_at` instant (ISO, UTC) or null. All 55 existing items carry null.
  - Optional `setWith: string[]`: non-empty for a set item, `[]` for "not a set". Absent means not scored.
  - Optional `shopUrl: string | null`: the expected stored `shop_url`; null means the post link. Absent means not scored.
  - The schema stays strict.
- **Scoring:**
  - field classes `expiry`, `set` and `link` are judged on the row from `toDealRows`. `expiry` replaces the raw-string comparison at `:334` and compares instants.
  - Gated classes: `missed`, `wrongGame`, `price`, `expiry`, `set`, `link`. `currency`, `platform` and `discount` stay reported only.
- **Per-item outcomes:** keyed `<postId>#<itemIndex>`, unpaired label items included, so a run yields `{ model → { key → gatedFailureClasses[] } }` plus per-model totals.
- **`judgeRuns({ baseline, runs, models })`** returns `{ verdict, reasons, record }`, with the rules in the test specification:
  - `record` maps each production model and each item key to the union of the gated failures across the runs;
  - every key is listed, ok items as `[]`.
- **`BOOTSTRAP_BASELINE`:** used only when no record exists. For the Mistral model, every key of the 55 original labels maps to `[]`, except post #49's item, which maps to `["missed"]`. The item is located by `evaluation.md`'s numbering, and its derivation is stated in a comment. Synthetic keys are absent, so they are new.

#### 4. Two runs, the gate and the record

**File**: `scripts/extract/eval.mts`

**Intent**: Turn the report into a gate.

**Contract**:
- `RUNS = 2`: every candidate is run twice.
- Cases come from `posts.json` and `synthetic-posts.json`. A label without a post still throws (`:139-145`).
- After the runs, `judgeRuns` takes the baseline from `scripts/extract/eval/result.json`, or from `BOOTSTRAP_BASELINE` when the record is missing. The Markdown report gains a "Gate" section with the verdict and every reason.
- On pass it writes `result.json`:
  - `{ promptFingerprint, labelsFingerprint, promptVersion, models: MODELS, runs: RUNS, verdict: "pass", record }`, as JSON with two-space indent and a trailing newline;
  - no post text, timings, costs, build ids or dates.
- Exit code 0 on pass, 1 on fail, 1 on abort as today.

#### 5. Synthetic posts and their labels

**File**: `scripts/extract/eval/synthetic-posts.json` (new); `scripts/extract/eval/labels.json`

**Intent**: Give the eval posts that exercise set recognition, a stated end and link choice. The agent writes them from scratch in each aggregator's format, and Tomasz reviews them.

**Contract**:
- About eight posts with ids `synthetic-01`…, in the shape `loadCases` expects:
  - two physical two-game sets for one price (a pepper post, a cenograj template);
  - a lowcygier article stating "do 31.10" → `2026-10-31T23:00:00Z`;
  - a pepper post stating "do 25.10, 7:00" → `2026-10-25T06:00:00Z`;
  - a relative "do niedzieli" with `published_at` on Wednesday 2026-10-21 → `2026-10-25T23:00:00Z`;
  - a two-shop pepper digest (each item its own shop link);
  - a pepper post linking both a shop and lowcygier (the shop link expected);
  - a post with no shop link (`shopUrl: null`).
- Hosts used in adversarial rows are `.example`. Nothing is copied from `posts.json` or a report.
- Labels state the expected rows from the post's own text and the PRD rules.

#### 6. Ignore rules

**File**: `.gitignore`; `.prettierignore`

**Intent**: Commit the record, the synthetic posts and the export query. Keep Prettier off the record the eval writes.

**Contract**:
- `.gitignore`: `!/scripts/extract/eval/result.json`, `!/scripts/extract/eval/synthetic-posts.json` and `!/scripts/extract/eval/export-posts.sql` after `:51`, with the comment above it updated.
- `.prettierignore`: `scripts/extract/eval/result.json`, under a comment naming its writer.

#### 7. Reproducible `posts.json`

**File**: `scripts/extract/eval/export-posts.sql` (new)

**Intent**: Rebuild `posts.json` from the 55 labelled ids rather than from `random()` (research, Open Question 5).

**Contract**: the export query of `context/changes/physical-deals-from-real-posts/evaluation.md:151-216`, with the `random()` sample replaced by a filter on the labels' `postId`s, producing the shape `loadCases` reads. A header comment says how to save the result.

#### 8. Unit tests

**File**: `tests/unit/extract/eval-gate.test.ts`, `tests/unit/extract/fingerprint.test.ts`, `tests/unit/extract/models.test.ts` (new)

**Intent**: The judge, scoring, fingerprint and refusal-check rows, and `MODELS ⊆ CANDIDATES`, from the test specification.

**Contract**: hand-written outcomes, labels and `DealRow` literals. No record file, no network, no model reply.

### Success Criteria:

#### Automated Verification:

- The new unit tests pass, and `judgeRuns` turns a leak in run 2 into a fail with a reason naming the model and the run
- `node scripts/extract/eval.mts` without credentials still aborts with exit 1 before any request
- `git check-ignore -v` reports `result.json`, `synthetic-posts.json` and `export-posts.sql` as not ignored, and `posts.json` and `report-v3.md` as ignored
- `npm test` passes
- `npm run lint` passes
- `npm run format:check` passes
- `npm run build` passes

#### Manual Verification:

- Tomasz reads each synthetic post with its label (set, expiry instant, expected link) and confirms or corrects it
- Tomasz runs `export-posts.sql` in the SQL editor and it returns 55 rows; `posts.json` is not overwritten

The 55 rows answer research Open Question 5: the labelled posts are still in `public.collected_posts`.

---

## Phase 6: First Passing Record and the Extractor Refusal

### Overview

Prove that the eval fails on a broken prompt, make the first passing record, and land three things in one commit: the record, its `npm test` check and the extractor's refusal.

### Test specification

- **Behaviour asserted:**
  - the committed record matches the code: `promptFingerprint()` and `labelsFingerprint()` of the committed files equal the record's fields;
  - `verdict` is `"pass"`;
  - every `MODELS` model has an entry;
  - `extract.mts` refuses a mismatch before reading credentials, and runs on a match.
- **Regression caught:**
  - a prompt, reply-format, model, temperature, max-tokens or label change committed without a passing eval (fails `npm test` locally, in the hook and in `ci.yml`);
  - the same change reaching production extraction (refused by `extract.mts`).
- **Research source:** *Making the eval a required gate* (B, C); decision 2026-10-13 (the extractor refuses); lessons.md, "A gate that exits 0 on warnings is not a gate" (prove it by breaking it).
- **Edge cases:** the record written on Windows and checked on Linux CI; a one-word prompt edit; a missing record file.
- **Anti-pattern avoided:** a gate nobody has seen fail; the paid eval in CI (CI only compares hashes).

### Changes Required:

#### 1. Record test

**File**: `tests/unit/extract/eval-record.test.ts` (new)

**Intent**: Bind the committed record to the code in `npm test`.

**Contract**:
- Reads `scripts/extract/eval/result.json`, `labels.json` and `synthetic-posts.json`.
- Asserts through `checkRecord` with both current fingerprints, and that every `MODELS` entry has a `record` entry.
- The failure message names `npm run extract:eval`.

#### 2. Extractor refusal

**File**: `scripts/extract/extract.mts`

**Intent**: Stop a prompt or model without a passing record from writing a single row.

**Contract**:
- The first statement of `main()` (`:197`), before the credential reads, reads `result.json` next to the eval (resolved from `import.meta.url`).
- It calls `checkRecord(text, { prompt: promptFingerprint() })` and throws `new Error(reason)` when refused.
- The existing `main().catch` prints "Extraction aborted: …" and sets exit 1. No run record is written, as with every other configuration abort.
- A comment says why the check runs first: it reads only a local file and sends nothing.

#### 3. The record itself

**File**: `scripts/extract/eval/result.json` (new, written by `npm run extract:eval`)

**Intent**: The first passing record.

**Contract**: produced by Tomasz's run on the clean tree after Phases 2–5. It is committed together with changes 1 and 2.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with `result.json` committed
- After one word of `INSTRUCTIONS` changes, `npm test -- --project unit` fails naming the prompt fingerprint mismatch, and `node scripts/extract/extract.mts` (no env file) aborts with that reason before the credential check; after the revert, `npm test` passes and the extractor proceeds to the missing-credential abort
- `npm run lint` passes
- `npm run format:check` passes
- `npm run build` passes

#### Manual Verification:

- Gate proof: Tomasz runs `npm run extract:eval` with the edition rule in `INSTRUCTIONS` temporarily inverted; it exits 1, reports leaks, writes no `result.json`, and the prompt is reverted
- Tomasz runs `npm run extract:eval` on the clean tree; it exits 0 and writes `result.json`, and its diff carries no post text
- CI `verify` passes on the push, so Linux computes the same fingerprints as Windows
- The next scheduled collect run's "Extract deals" step is green, and the deals page's freshness line advances

The inverted rule calls digital offers physical, so leaks are certain. Each eval run costs about $0.06 and takes 15–20 minutes.

---

## Phase 7: Cookbook and Rules-File Facts

### Overview

Fill §6.1, §6.3 and §6.6 of the test plan with the patterns shipped, and state the new facts in CLAUDE.md.

### Changes Required:

#### 1. Test plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Make §6 the answer to "how do I add a listing or link test" and "how do I change the prompt or the model".

**Contract**:
- **§6.1, extended:**
  - rule tests for `scripts/extract/` live in `tests/unit/extract/` and import through relative `.mts` paths;
  - `extract.mts` and `eval.mts` must never be imported, because they run `main()`;
  - adversarial tables name their threat;
  - expiry rows use literal instants from the EU DST rule;
  - fixed-output tests are named "row mapping";
  - references: `expiry.test.ts`, `deal-rows.test.ts`, `shop-url.test.ts`, `links.test.ts`.
- **§6.3, filled:**
  - when the eval is required: any change the fingerprints see, which `npm test` reports;
  - who can run it (the OpenRouter key and `posts.json`; recovery through `export-posts.sql`);
  - what blocks (the gated classes and the baseline rules), what to commit (the change together with `result.json`);
  - what to do on a flaky fail (rerun once, read the reasons);
  - what the extractor does on a mismatch, and how to recover;
  - how to add a labelled post, real or synthetic;
  - that the ≤5% share is measured afterwards by `npm run extract:report`;
  - that a hand edit of `result.json` defeats the check, so the record is a speed bump, not proof.
- **§6.6:** a 2–3 line Phase 2 note:
  - `create or replace view` drops `security_invoker` unless restated;
  - the eval had exited 0 on leaks;
  - the fingerprint hashes the request body because the instructions are private;
  - Windows hooks use exec form.

#### 2. Rules file

**File**: `CLAUDE.md`

**Intent**: Facts only, no rationale (lessons.md holds that).

**Contract**:
- **Deal extraction:** the bullet "A model enters it only after passing `npm run extract:eval`" becomes the gate fact:
  - the eval exits 1 on a breach and writes `scripts/extract/eval/result.json` on a pass;
  - a change to what is sent to the model commits together with a new `result.json`;
  - `npm test` and `npm run extract` refuse a mismatch.
- **Supabase or Deal matching:** the listed predicate (game, physical, priced, not expired) is stated in the select policy on `public.deals`, in `public.matched_deals` and in the page query.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run format:check` passes
- Every path cited in §6.1, §6.3 and §6.6 exists in the repository

#### Manual Verification:

- Tomasz reads §6.3 and can follow it, without other context, to change the prompt: which command, what blocks, what to commit, what to do when the extractor refuses

---

## Testing Strategy

### Unit Tests:

- **Expiry instant:** both 2026 clock changes, ambiguous and missing wall times, one-digit hours, invalid and unreadable inputs.
- **Row mapping:** set data, price and discount cleaning, wiring of expiry and link.
- **Other rules:** listability; expiry display.
- **Write-time link rule:** adversarial HTML, aggregators, userinfo, the feed drift check.
- **Render-time link check:** every non-web scheme.
- **The eval gate:** the judge, scoring, fingerprints, the refusal check, `MODELS ⊆ CANDIDATES`, the committed record.

### Integration Tests:

- `supabase/checks/listed-expiry.sql` in PGlite (through `tests/db/listed-expiry.test.ts`) and hosted: the hide on both relations, the boundary instant, `security_invoker` preserved.
- The AI-native layer: `npm run extract:eval`, human-run, required before any change the prompt fingerprint sees (checked: 2026-10-13). When NOT to use: changes the fingerprints do not see, where the unit suite covers post-processing.

### Manual Testing Steps:

1. Phase 1: a live agent edit triggers the unit hook, and a failing db test wakes the agent.
2. Phase 4: `db:push`, `db:check`, and the hosted runs of `listed-expiry.sql` and `matching.sql`.
3. Phase 5: review of the synthetic posts; `export-posts.sql` returns 55 rows.
4. Phase 6: the gate-proof eval exits 1; the real eval exits 0; the next collect run's extract step is green.
5. Phase 7: §6.3 is followable without other context.

## Performance Considerations

- The unit project runs synchronously after each mapped edit (≈ 4 s wall). The db project runs in the background (≈ 16 s), one at a time.
- A gated eval runs two runs of both candidates over ~63 posts: ≈ $0.06 and ≈ 15–20 min wall, estimated from v3's costs and latencies.
- The `now()` term in the policy and the view adds a per-row comparison that is negligible at the current size (1,162 listed deals in the last crawl).

## Migration Notes

- The migration is additive in effect: it narrows what the publishable key reads to what the deployed page already shows. Tomasz applies it by hand (`db:push`). The `-- Revert:` header restores the three-term policy and the previous view body.
- Rows already stored with another aggregator's link or a userinfo URL stay as they are. They are rewritten only when their post is extracted again.
- `result.json` and the extractor refusal land in one commit after the first passing run.
- While the extractor refuses, collection keeps running and posts wait. The way out is a passing eval and its record; `EXTRACT_PAUSED` only skips the step.

## References

- Research: `context/changes/testing-extraction-and-listing-guard/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 #2, #5; §4; §5; §6)
- Prior phase: `context/changes/testing-matching-rule-protection/plan.md` (runner, PGlite harness, check-file runner)
- Slice records: `context/changes/physical-deals-from-real-posts/evaluation.md`, `review.md`, `plan.md:853-867`
- Hooks reference: https://code.claude.com/docs/en/hooks (checked: 2026-10-13)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Post-Edit Hook

#### Automated

- [x] 1.1 `npm run lint` passes with the hook script — d62260e
- [x] 1.2 A payload for `tests/unit/watchlist/fold.test.ts` piped into the unit handler runs the unit project and exits 0; the same payload with a lowercase drive letter routes the same way — d62260e
- [x] 1.3 A payload for `src/app/page.tsx` exits 0 from both handlers without starting Vitest — d62260e
- [x] 1.4 A payload for `supabase/checks/matching.sql` piped into the db handler runs the db project and exits 0 — d62260e
- [x] 1.5 A deliberately failing assertion in a unit test makes the unit handler exit 2 with the failure on stderr; the assertion is reverted — d62260e
- [x] 1.6 Two db handler invocations started together run the db project twice in sequence, never in parallel — d62260e
- [x] 1.7 A payload for `scripts/extract/prompt.mts` prints the eval reminder as `additionalContext` — d62260e

#### Manual

- [x] 1.8 In a live Claude Code session in VS Code, an agent edit to a unit-path file shows the hook's result in the transcript, and a deliberately failing db test wakes the agent through `asyncRewake`; both are reverted — d62260e

### Phase 2: Write-Side Listing Rules

#### Automated

- [x] 2.1 The `7:00` rows fail before the `TIME` change and pass after it
- [x] 2.2 `npm test -- --project unit` passes with the three new files
- [x] 2.3 `npm test` passes
- [x] 2.4 `npm run lint` passes
- [x] 2.5 `npm run format:check` passes
- [x] 2.6 `npm run build` passes, type-checking the tests that import `.mts` files

### Phase 3: The Link Rule at Write and Render Time

#### Automated

- [ ] 3.1 The aggregator and userinfo rows fail before the `verifyShopUrl` change and pass after it
- [ ] 3.2 Removing `lowcygier.pl` from `AGGREGATOR_SITES` makes the feed drift test fail; the entry is restored
- [ ] 3.3 `npm test` passes
- [ ] 3.4 `npm run lint` passes
- [ ] 3.5 `npm run format:check` passes
- [ ] 3.6 `npm run build` passes

### Phase 4: Expired Deals Hidden by the Database

#### Automated

- [ ] 4.1 `tests/db/listed-expiry.test.ts` fails before the migration file exists and passes after it
- [ ] 4.2 `npm test` passes, `supabase/checks/matching.sql` included, unchanged
- [ ] 4.3 `npm run lint` passes
- [ ] 4.4 `npm run format:check` passes

#### Manual

- [ ] 4.5 Tomasz: `npm run db:push -- --dry-run` lists only the new migration, then `npm run db:push`
- [ ] 4.6 Tomasz: `npm run db:check` exits 0 and `npm run db:status` shows no drift
- [ ] 4.7 Tomasz: `supabase/checks/listed-expiry.sql` in the hosted SQL editor ends with "All checks passed."
- [ ] 4.8 Tomasz: `supabase/checks/matching.sql` in the hosted SQL editor ends with "All checks passed."
- [ ] 4.9 `/` and `/my-deals` on production still list deals after the push

### Phase 5: The Eval Gate's Logic

#### Automated

- [ ] 5.1 The new unit tests pass, and `judgeRuns` turns a leak in run 2 into a fail with a reason naming the model and the run
- [ ] 5.2 `node scripts/extract/eval.mts` without credentials still aborts with exit 1 before any request
- [ ] 5.3 `git check-ignore -v` reports `result.json`, `synthetic-posts.json` and `export-posts.sql` as not ignored, and `posts.json` and `report-v3.md` as ignored
- [ ] 5.4 `npm test` passes
- [ ] 5.5 `npm run lint` passes
- [ ] 5.6 `npm run format:check` passes
- [ ] 5.7 `npm run build` passes

#### Manual

- [ ] 5.8 Tomasz reads each synthetic post with its label (set, expiry instant, expected link) and confirms or corrects it
- [ ] 5.9 Tomasz runs `export-posts.sql` in the SQL editor and it returns 55 rows; `posts.json` is not overwritten

### Phase 6: First Passing Record and the Extractor Refusal

#### Automated

- [ ] 6.1 `npm test` passes with `result.json` committed
- [ ] 6.2 After one word of `INSTRUCTIONS` changes, `npm test -- --project unit` fails naming the prompt fingerprint mismatch, and `node scripts/extract/extract.mts` (no env file) aborts with that reason before the credential check; after the revert, `npm test` passes and the extractor proceeds to the missing-credential abort
- [ ] 6.3 `npm run lint` passes
- [ ] 6.4 `npm run format:check` passes
- [ ] 6.5 `npm run build` passes

#### Manual

- [ ] 6.6 Gate proof: Tomasz runs `npm run extract:eval` with the edition rule in `INSTRUCTIONS` temporarily inverted; it exits 1, reports leaks, writes no `result.json`, and the prompt is reverted
- [ ] 6.7 Tomasz runs `npm run extract:eval` on the clean tree; it exits 0 and writes `result.json`, and its diff carries no post text
- [ ] 6.8 CI `verify` passes on the push, so Linux computes the same fingerprints as Windows
- [ ] 6.9 The next scheduled collect run's "Extract deals" step is green, and the deals page's freshness line advances

### Phase 7: Cookbook and Rules-File Facts

#### Automated

- [ ] 7.1 `npm run lint` passes
- [ ] 7.2 `npm run format:check` passes
- [ ] 7.3 Every path cited in §6.1, §6.3 and §6.6 exists in the repository

#### Manual

- [ ] 7.4 Tomasz reads §6.3 and can follow it, without other context, to change the prompt: which command, what blocks, what to commit, what to do when the extractor refuses
