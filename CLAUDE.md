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
- In @src/utils/supabase/session.ts, do not move `await supabase.auth.getUser()` and do not return anything other than `supabaseResponse`. Failure mode: random logouts. The reason is spelled out in that file's comments.
- The public key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `..._ANON_KEY`). `SUPABASE_SECRET_KEY` bypasses RLS and **never** takes the `NEXT_PUBLIC_` prefix. Full list: @.env.example
- Per-user data isolation rests on Postgres RLS, not on filtering in application code.

## Database migrations

- The schema lives in `supabase/migrations/` and is applied by hand. The loop is `npm run db:new -- <name>` → `npm run db:push -- --dry-run` → `npm run db:push` → `npm run db:check`. Use the npm scripts, not the bare CLI: they carry the flags, and `supabase db advisors` without `--fail-on error` exits 0 while printing the very finding it was hired to catch.
- From a clean checkout the CLI is unlinked. `npx supabase login`, then `npx supabase link --project-ref <ref>`. Both are interactive and belong to a human — `link` asks for the database password, which is not in this repository and must not be read out of `.env.local` (see **Secrets**).
- `npm run db:push` is a human action, never CI. No credential that can write the database belongs in a workflow.
- Every new table in `public` ships locked: `enable row level security` plus `revoke all on table <t> from anon, authenticated`, and no policy. Add a policy only when a browser client genuinely needs the rows, and justify it in the migration. Leave `service_role` alone — that is the server-side write path.
- Open every migration with two header lines: `-- Revert: <the statement that undoes this>` and a one-line statement of whether it is backward-compatible with the previous deployment. `vercel rollback` moves traffic only and does not undo a migration, so a migration must stay compatible for the length of one rollback window.
- Migrations are additive. A change that drops a column, narrows a type or adds `not null` to an existing one splits in two: the additive half now, the destructive half in a later migration, once the deployment that needed the old shape is no longer a rollback target. `supabase migration down` is not an escape — it resets rather than reverts, and takes the data with it.
- `npm run db:status` is the drift check between the repository and the hosted project. Manual apply makes drift possible; this is what detects it.
- Do not set `auto_expose_new_tables` in `supabase/config.toml`. It governs only the local stack, so it would hide a forgotten `revoke` exactly where mistakes are cheap and expose it where they are not. The `revoke` in the migration behaves the same in both places.

## Directories

- `_incoming/` is a staging directory listed in `.gitignore` — do not import from it into `src/` before deciding where the code finally belongs (@_incoming/README.md).
- The current PRD is `context/foundation/prd.md`; `prd_old.md` is stale.

## Verification

- `npm run lint` runs `eslint --max-warnings 0` (flat config) — the flag is deliberate, do not drop it. `npm run format:check` runs Prettier. Both make up the `verify` gate in `.github/workflows/ci.yml`; `deploy` does not start until they pass.
- There is no test runner and no tests. Do not claim tests passed — verify with `npm run build`, `npm run lint` or `npm run format:check`.

## Commits

- Do not add `Co-Authored-By` trailers, "Generated with" lines, or any other attribution to commit messages or pull request descriptions.
- Keep the subject line short and imperative. Add a body only when the change needs a reason the diff does not show.

## Secrets

- Never read `.env.local`, or any other file holding credentials, by any route: not with the Read tool, and not indirectly through `cat`, `node -e`, a script, or any other shell command. The `Read(.env.local)` deny rule in `.claude/settings.json` only covers the Read tool — this rule covers every path to the file, because a permission pattern cannot constrain an interpreter.
- To learn whether a variable is set, ask the user. Do not read the file to find out.
- Never print a secret, or any part of one, into the conversation — that includes prefixes, lengths and fragments.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
