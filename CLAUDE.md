<!-- Project rules. Kept OUTSIDE the 10x-cli BEGIN/END markers so sync won't overwrite them. -->

# physical-games-deals

Next.js 16 + Supabase. A collector of physical game releases; deals are extracted with an LLM from human-written RSS posts.
Context: @context/foundation/prd.md, @context/foundation/tech-stack.md, @context/foundation/lessons.md

## Language

Write every project artifact in English: code comments, documentation, README files, configuration comments, commit messages and PR descriptions. Keep this rule even when the conversation is in Polish — the prompt language does not change the artifact language.

The exception is `context/`: the product-thinking documents there (`prd.md`, `shape-notes.md`, `tech-stack.md`) stay in Polish. Do not translate them, and write new ones in Polish too. `context/foundation/lessons.md` is the one file in that directory kept in English, because review skills quote its rules verbatim.

## Next 16 — not the Next.js you know

- Before writing code that touches a framework API, read the relevant file in `node_modules/next/dist/docs/` — see @AGENTS.md.
- The `middleware` convention is called **`proxy`** here: the file is `src/proxy.ts` and it exports `proxy()`, not `middleware()`. Do not create `middleware.ts`.

## Supabase

- Three clients: @src/utils/supabase/client.ts ("use client"), @src/utils/supabase/server.ts (Server Components / Actions / Route Handlers), @src/utils/supabase/session.ts (for `src/proxy.ts` only). Supabase's own docs call that last one `utils/supabase/middleware.ts`.
- Call `createClient()` from `server.ts` fresh on every request. Never hold the result in a module-level variable — session cookies are per-request.
- In @src/utils/supabase/session.ts, do not move `await supabase.auth.getUser()`. `updateSession()` returns `supabaseResponse` together with the user, and any redirect goes through its `redirectTo()`, which copies the cookies and cache headers. Returning any other response causes random logouts.
- Every path is public except `/watchlist` and `/my-deals`: `src/proxy.ts` sends signed-in users from `/login` and `/signup` to `/`, and signed-out users from both to `/login` (@src/lib/auth/access.ts). Nothing enforces privacy by default — a private view needs its own rule there, and its data stays behind RLS either way. Server Action calls pass the proxy, so every action checks the user itself.
- The public key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `..._ANON_KEY`). `SUPABASE_SECRET_KEY` bypasses RLS and **never** takes the `NEXT_PUBLIC_` prefix. Full list: @.env.example
- Per-user data isolation rests on Postgres RLS, not on filtering in application code.

## Game catalogue

- The provider is RAWG. The contract is `src/lib/catalog/types.ts`; `src/lib/catalog/rawg.ts` is the only file that knows RAWG.
- `RAWG_API_KEY` is server-only and **never** takes the `NEXT_PUBLIC_` prefix. It rides in the request URL (`?key=`), so request URLs are never logged, thrown or returned. It lives in Vercel's project environment variables, for Production and Preview, and in `.env.local` for `npm run dev` and `npm run catalog:probe`.
- Files under `src/lib/catalog/` are also loaded by Node, so only whole-statement `import type` crosses between them. Scripts importing `src/` run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`.
- RAWG's terms require an active link to rawg.io on every page showing its data.

## Deal extraction

- The provider is OpenRouter. `scripts/extract/openrouter.mts` is the only file that knows it.
- `OPENROUTER_API_KEY` is server-only and **never** takes the `NEXT_PUBLIC_` prefix. It lives in the GitHub Actions secrets, scoped to the extract step, and in `.env.local` for the extract scripts.
- The model list is `MODELS` in `scripts/extract/config.mts`. A model enters it only after passing `npm run extract:eval`.
- Two repository variables steer the extract step without a deploy. `EXTRACT_PAUSED=true` skips it while collection keeps running. `EXTRACT_SINCE` — a date (`YYYY-MM-DD`, from the start of that day in Warsaw) or an instant with its offset — limits extraction to posts first seen since then; unset, every pending post is extracted. Locally, `npm run extract -- --since <value>` sets the cut-off for one run.

## Deal matching

- `/my-deals` reads `public.matched_deals`, a `security_invoker` view: the listed deals that match the caller's active watchlist entries.
- The rule is `public.fold_for_matching` and `public.game_match_key`, in `supabase/migrations/20261012070050_match_deals_to_watchlist.sql`; `game_match_key`'s current body is in `20261012130317_bound_game_match_key.sql`. `deals.match_keys` and `deals.match_text` are generated columns computed from them.
- `foldForMatching` in `src/lib/watchlist/rules.ts` mirrors `public.fold_for_matching` for the phrase pre-check, and must stay identical to it.
- `create or replace function` neither recomputes the stored keys nor rebuilds an index. A migration that changes a matching function also runs `update public.deals set title = title`, and, for the fold, settles the phrases that newly fold alike and runs `reindex index public.watchlist_entries_active_phrase_folded`.
- `supabase/checks/matching.sql` is the rule's truth table. `npm test` runs it unchanged in PGlite against `supabase/migrations/` (`tests/db/matching.test.ts`). Rerun it in the SQL editor after every change to the rule; it ends in an error on purpose and rolls itself back.

## Database migrations

- The schema lives in `supabase/migrations/` and is applied by hand. The loop is `npm run db:new -- <name>` → `npm test` → `npm run db:push -- --dry-run` → `npm run db:push` → `npm run db:check`. Use the npm scripts, not the bare CLI: they carry the flags, and `supabase db advisors` without `--fail-on error` exits 0 while printing the very finding it was hired to catch.
- From a clean checkout the CLI is unlinked. `npx supabase login`, then `npx supabase link --project-ref <ref>`. Both are interactive and belong to a human — `link` asks for the database password, which is not in this repository and must not be read out of `.env.local` (see **Secrets**).
- `npm run db:push` is a human action, never CI. No credential that can change the schema belongs in a workflow — every DDL path stays human-only. Row writes are the deliberate exception: the collector inserts into `public.collected_posts`, and the extractor updates its processing columns and writes `public.post_extractions`, `public.deals` and `public.pipeline_runs`. Both run from `.github/workflows/collect.yml` using `SUPABASE_SECRET_KEY`, held as a GitHub Actions secret that reaches neither Vercel nor the browser.
- Every new table in `public` ships locked: `enable row level security` plus `revoke all on table <t> from anon, authenticated, service_role`, and no policy. Then grant `service_role` exactly what the server-side writer uses — Supabase grants new tables to all three roles automatically until 2026-10-30 and to none after it, and the pair gives the same privileges either way. A missing grant surfaces as `42501` at write time, not at push. Add a policy, with `grant select` to `anon, authenticated`, only when a client holding the publishable key genuinely needs the rows — a browser, or a Server Component on Vercel — and justify it in the migration. A table that signed-in users write themselves (`public.watchlist_entries`) grants `authenticated` `select` plus column-level `insert` and `update` on just the columns they write, takes `user_id` from `default auth.uid()`, pins every policy to `(select auth.uid())`, and grants `anon` and `service_role` nothing.
- Every new function in `public` ships locked too: `revoke execute on function <f> from public, anon, authenticated, service_role`, then `grant execute` to each role that calls it — including the role whose write evaluates it in a generated column or an index expression. Postgres grants every new function to `PUBLIC`, and Supabase's default privileges grant it to all three roles, so a function left alone is an RPC endpoint for `anon`. A missing grant surfaces as `42501` at write time, not at push.
- Open every migration with two header lines: `-- Revert: <the statement that undoes this>` and a one-line statement of whether it is backward-compatible with the previous deployment. `vercel rollback` moves traffic only and does not undo a migration, so a migration must stay compatible for the length of one rollback window.
- Migrations are additive. A change that drops a column, narrows a type or adds `not null` to an existing one splits in two: the additive half now, the destructive half in a later migration, once the deployment that needed the old shape is no longer a rollback target. `supabase migration down` is not an escape — it resets rather than reverts, and takes the data with it.
- `npm run db:status` is the drift check between the repository and the hosted project. Manual apply makes drift possible; this is what detects it.
- Do not set `auto_expose_new_tables` in `supabase/config.toml`. It governs only the local stack, so it would hide a forgotten `revoke` exactly where mistakes are cheap and expose it where they are not. The `revoke` in the migration behaves the same in both places.

## Directories

- The current PRD is `context/foundation/prd.md`; `prd_old.md` is stale.

## Verification

- `npm run lint` runs `eslint --max-warnings 0` (flat config) — the flag is deliberate, do not drop it. `npm run format:check` runs Prettier. With `npm test` they make up the `verify` gate in `.github/workflows/ci.yml`; `deploy` does not start until all three pass.
- `npm test` runs Vitest (`vitest.config.mts`) in two projects, both in the `node` environment: `unit` collects `tests/unit/**/*.test.ts`, and `db` collects `tests/db/**/*.test.ts`, which run against PGlite built from `supabase/migrations/` behind the Supabase stub in `tests/db/stub/`. A test file outside those patterns is never run.
- Run Vitest through `npm test`, passing options after `--` (`npm test -- --project unit`), not through `npx vitest`. `scripts/test.mts` starts it from the canonical path of the working directory; started from `c:\…` with a lowercase drive letter, Vitest 5.0.4 fails every test file.

## Commits

- Do not add `Co-Authored-By` trailers, "Generated with" lines, or any other attribution to commit messages or pull request descriptions.
- Keep the subject line short and imperative. Add a body only when the change needs a reason the diff does not show.

## Secrets

- Never read `.env.local`, or any other file holding credentials, by any route: not with the Read tool, and not indirectly through `cat`, `node -e`, a script, or any other shell command. The `Read(.env.local)` deny rule in `.claude/settings.json` only covers the Read tool — this rule covers every path to the file, because a permission pattern cannot constrain an interpreter.
- The one sanctioned exception is the credential-loading scripts: `npm run collect`, `npm run collect:import`, `npm run catalog:probe`, `npm run extract`, `npm run extract:eval` and `npm run extract:report` pass `--env-file-if-exists=.env.local` to node, so the process loads the file while nothing reads or prints its contents. Running those commands is not a breach of the rule above; opening the file to see what is in it still is.
- To learn whether a variable is set, ask the user. Do not read the file to find out.
- Never print a secret, or any part of one, into the conversation — that includes prefixes, lengths and fragments.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 1

Open Module 3 by producing a **durable, risk-first quality contract** before any test is written — then drive each rollout phase through the standard change chain.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategy §1–§5 frozen + cookbook §6 grows)
        │
        ▼  (one rollout phase at a time, /clear between handoffs)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` is a **stateful orchestrator**, not a one-shot generator. On first run it writes the phased rollout to `context/foundation/test-plan.md`. On every subsequent run it re-derives state from on-disk artifacts and presents the next handoff. The lesson focus is **strategy and rollout sequencing, not configuration**. Hooks, MCP servers, and CI YAML are configured in later lessons of this module.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Quality strategy as a rules-file (lesson focus)** | |
| `/10x-test-plan` | You have a PRD (and ideally a roadmap and a few archived slices) and you are about to write the project's first tests, or you noticed that AI-generated tests are landing on helpers while critical flows go uncovered. First invocation runs discovery (PRD + roadmap + archive + hot-spot scan), a 5-question user interview, and a synthesis pass with a mandatory challenger check, then writes `test-plan.md` in `context/foundation/` with a risk map (5–7 failure scenarios), a phased rollout table, a stack table, a quality-gates table, a cookbook section (`§6`, fills in as phases ship), and a negative-space section (what we deliberately don't test). Subsequent invocations advance the rollout one handoff at a time. |
| `/10x-test-plan --status` | A `test-plan.md` already exists and you want a compact snapshot of where the rollout stands — which phases are `not started`, `change opened`, `researched`, `planned`, `implementing`, or `complete`, and what the next action is. Does no work; safe to run any time. |
| `/10x-test-plan --refresh` | A `test-plan.md` already exists and one of: a new top-3 risk surfaced from the roadmap or archive, a tool's `checked:` date is older than three months, the project's tech stack changed, or §7 negative-space no longer matches what the team believes. Opens a new `test-plan-refresh-<YYYY-MM-DD>` change folder rather than editing the guide in place. |

### Rollout chain — what happens after the guide is written

The guide's §3 *Phased Rollout* table is the orchestrator's state. For each non-`complete` row the orchestrator selects the next handoff based on which artifacts exist in `context/changes/<change-id>/`:

| State on disk | Next handoff | Status transitions to |
| --- | --- | --- |
| change folder missing | `/10x-new <change-id>` | `change opened` |
| `change.md` only | `/10x-research` (with a risks-to-verify brief) | `researched` |
| `+ research.md` | `/10x-plan` (with cost × signal + cookbook-update constraints) | `planned` |
| `+ plan.md` with pending `## Progress` items | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` fully `[x]` | Mark §3 row `complete`; loop to next pending row | — |

Each handoff is a **STOP point**. The orchestrator copies the next command to the clipboard, asks the user to `/clear` and run it, then exits. Re-invoke `/10x-test-plan` (no arguments) to advance.

### Risk-first prioritization rules

- Risks are **failure scenarios in user / business terms**, not test names. "Logged-out user reaches paid content via stale token" is a risk; "test the login form" is not.
- 5 to 7 risks. Fewer is too coarse; more makes prioritization useless.
- Impact and likelihood are user/business ratings, not technical complexity.
- Every risk traces to a source: PRD section, archived slice, roadmap entry, Phase 2 interview question, hot-spot **directory** with churn count, or a tech-stack constraint. No invented risks.
- **Signal, not knowledge.** §2 cites *evidence that raised the risk*, never a file as "where the failure lives." File:line anchors, function names, schema names, and module names are forbidden in §2 — they belong in `/10x-research`'s output, produced per rollout phase against current code. The plan is a QA spec; it is not a code audit.
- Coverage is not the metric. **Risk coverage** is the metric.

### Dual-layer mapping rules

- Classic layer first: the cheapest test that gives a real signal wins. Promote to e2e only when no cheaper layer covers the risk.
- AI-native layer second, and only where it adds signal classic tests do not give cheaply.
- Every AI-native row has a **"When NOT to use"** line. If you cannot write one, drop the row.
- Every tool name carries a `checked: <YYYY-MM-DD>` date. Tool names are examples of the category, not endorsements.
- Both layers must be non-empty in the final guide if the project warrants them. Classic-only is a 2020 plan; AI-native-only is hype. AI-native phases are not mandatory — include them only when the brief justified them under cost × signal.

### Quality gates rules

- Required gates (lint, typecheck, unit+integration, e2e on critical flows) must map to actual CI steps. If a required gate is not yet wired, mark it as `required after §3 Phase <N>` and let the named rollout phase wire it.
- Post-edit hook is **recommended local**, not a CI substitute.
- Multimodal visual review is **selective**, applied to 1–3 critical screens, not to every page.
- Vision-driven fallback (Anthropic Computer Use or OpenAI CUA) is reserved for DOM-unreachable surfaces; expensive per action.

### Cookbook patterns (§6) — fills in over time

`test-plan.md` is both a phased strategy and a **growing cookbook**. §6 starts as placeholders (`TBD — see §3 Phase <N>`) and fills in incrementally — each rollout phase's plan ends with a sub-phase that updates the relevant §6 entry (location, naming, reference test, run command). After Module 3 completes, §6 becomes the canonical answer to "how do I add a test for X in this project?" — and is what `/10x-tdd` reads in Lesson 2.

### Lesson boundaries

- Do not write test code. That is Lesson 2 (`/10x-tdd` and unit-test authoring).
- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch or write GitHub Actions YAML. The guide names gates; configuration is owned by Module 1 Lesson 5 and Module 2 Lesson 5.
- Do not benchmark multimodal models. Cite criteria (cost, latency, agent-friendliness), never a ranking.
- Do not read the codebase for knowledge (call graphs, schemas, "which file owns this failure"). That is `/10x-research`'s job, per rollout phase.

### Paths used by this lesson

- `context/foundation/test-plan.md` — the quality contract produced and maintained by `/10x-test-plan`
- `context/foundation/prd.md` — primary risk source
- `context/foundation/roadmap.md` — likelihood weighting
- `context/foundation/tech-stack.md` — stack input (when present)
- `context/archive/<change-id>/plan.md` — implemented risk surface
- `context/changes/<change-id>/` — per-rollout-phase change folder (one per row in §3)

<!-- END @przeprogramowani/10x-cli -->
