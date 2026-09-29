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
- Every path is public: `src/proxy.ts` only sends signed-in users from `/login` and `/signup` to `/` (@src/lib/auth/access.ts). Nothing enforces privacy by default — a private view needs its own rule there, and its data stays behind RLS either way.
- The public key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `..._ANON_KEY`). `SUPABASE_SECRET_KEY` bypasses RLS and **never** takes the `NEXT_PUBLIC_` prefix. Full list: @.env.example
- Per-user data isolation rests on Postgres RLS, not on filtering in application code.

## Game catalogue

- The provider is RAWG. The contract is `src/lib/catalog/types.ts`; `src/lib/catalog/rawg.ts` is the only file that knows RAWG.
- `RAWG_API_KEY` is server-only and **never** takes the `NEXT_PUBLIC_` prefix. It rides in the request URL (`?key=`), so request URLs are never logged, thrown or returned.
- Files under `src/lib/catalog/` are also loaded by Node, so only whole-statement `import type` crosses between them. Scripts importing `src/` run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`.
- RAWG's terms require an active link to rawg.io on every page showing its data.

## Deal extraction

- The provider is OpenRouter. `scripts/extract/openrouter.mts` is the only file that knows it.
- `OPENROUTER_API_KEY` is server-only and **never** takes the `NEXT_PUBLIC_` prefix. It lives in the GitHub Actions secrets, scoped to the extract step, and in `.env.local` for the extract scripts.
- The model list is `MODELS` in `scripts/extract/config.mts`. A model enters it only after passing `npm run extract:eval`.

## Database migrations

- The schema lives in `supabase/migrations/` and is applied by hand. The loop is `npm run db:new -- <name>` → `npm run db:push -- --dry-run` → `npm run db:push` → `npm run db:check`. Use the npm scripts, not the bare CLI: they carry the flags, and `supabase db advisors` without `--fail-on error` exits 0 while printing the very finding it was hired to catch.
- From a clean checkout the CLI is unlinked. `npx supabase login`, then `npx supabase link --project-ref <ref>`. Both are interactive and belong to a human — `link` asks for the database password, which is not in this repository and must not be read out of `.env.local` (see **Secrets**).
- `npm run db:push` is a human action, never CI. No credential that can change the schema belongs in a workflow — every DDL path stays human-only. Row writes are the deliberate exception: the collector inserts into `public.collected_posts` from `.github/workflows/collect.yml` using `SUPABASE_SECRET_KEY`, held as a GitHub Actions secret that reaches neither Vercel nor the browser.
- Every new table in `public` ships locked: `enable row level security` plus `revoke all on table <t> from anon, authenticated`, and no policy. Add a policy only when a browser client genuinely needs the rows, and justify it in the migration. Leave `service_role` alone — that is the server-side write path.
- Open every migration with two header lines: `-- Revert: <the statement that undoes this>` and a one-line statement of whether it is backward-compatible with the previous deployment. `vercel rollback` moves traffic only and does not undo a migration, so a migration must stay compatible for the length of one rollback window.
- Migrations are additive. A change that drops a column, narrows a type or adds `not null` to an existing one splits in two: the additive half now, the destructive half in a later migration, once the deployment that needed the old shape is no longer a rollback target. `supabase migration down` is not an escape — it resets rather than reverts, and takes the data with it.
- `npm run db:status` is the drift check between the repository and the hosted project. Manual apply makes drift possible; this is what detects it.
- Do not set `auto_expose_new_tables` in `supabase/config.toml`. It governs only the local stack, so it would hide a forgotten `revoke` exactly where mistakes are cheap and expose it where they are not. The `revoke` in the migration behaves the same in both places.

## Directories

- The current PRD is `context/foundation/prd.md`; `prd_old.md` is stale.

## Verification

- `npm run lint` runs `eslint --max-warnings 0` (flat config) — the flag is deliberate, do not drop it. `npm run format:check` runs Prettier. Both make up the `verify` gate in `.github/workflows/ci.yml`; `deploy` does not start until they pass.
- There is no test runner and no tests. Do not claim tests passed — verify with `npm run build`, `npm run lint` or `npm run format:check`.

## Commits

- Do not add `Co-Authored-By` trailers, "Generated with" lines, or any other attribution to commit messages or pull request descriptions.
- Keep the subject line short and imperative. Add a body only when the change needs a reason the diff does not show.

## Secrets

- Never read `.env.local`, or any other file holding credentials, by any route: not with the Read tool, and not indirectly through `cat`, `node -e`, a script, or any other shell command. The `Read(.env.local)` deny rule in `.claude/settings.json` only covers the Read tool — this rule covers every path to the file, because a permission pattern cannot constrain an interpreter.
- The one sanctioned exception is the credential-loading scripts: `npm run collect`, `npm run collect:import`, `npm run catalog:probe`, `npm run extract`, `npm run extract:eval` and `npm run extract:report` pass `--env-file-if-exists=.env.local` to node, so the process loads the file while nothing reads or prints its contents. Running those commands is not a breach of the rule above; opening the file to see what is in it still is.
- To learn whether a variable is set, ask the user. Do not read the file to find out.
- Never print a secret, or any part of one, into the conversation — that includes prefixes, lengths and fragments.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 5 (10xDevs 4.0 UI)

Treat a visual change as a **10x change with a design-system contract**, not a "make it pretty" chat:

```
/10x-new -> audit+reference research -> plan (tokens then one view) -> implement -> screenshot gate -> /10x-impl-review
```

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| `/10x-ui` | A view that already renders and needs auditing and improving: theme, restyle, "nicer UI", tokens, visual pass — on the course app or any other stack. Not for building the view in the first place. |
| `/10x-research` | Locate this repo's value source and shared components, map which views read them, and pick a named motif — not a moodboard. Output is a list of charges (file, line, user impact). |
| `/10x-plan` / `/10x-implement` | Same chain as earlier M2 lessons; payload is UI. |
| `/10x-impl-review` | Before merge; do not skip visual findings as cosmetic. |

### Contract

- Two halves, whatever the stack: semantic tokens in one source, and importable components living in the repo. Tailwind v4 `@theme` + shadcn is how the course app realises them; read this repo's own realisation before proposing values.
- Values taken from outside go into the repo with a line naming the source. Not into the chat history.
- One view + global tokens. Not a whole-MVP rebrand. Not worktrees/`/goal`.
- Three charge categories: missing tokens, missing shared component, accidental architecture.
- Visual gate: a kitchen sink rendering every state, screenshotted; wire it into a screenshot test only if the repo already has one. Do not blind-update baselines.
- No design system in the repo? Proposing one is allowed — marked as adding a dependency, scoped to what the change needs, and always losing to a system that already exists.
- Models: route by phase, not vendor. Strongest model you have for audit, plan and review; a cheaper working tier for implementing charges in the loop; escalate only when the same charge survives two rounds. Any vision-capable model works, and no single model — Fable 5.1 included — is a requirement.

### Lesson boundaries

- Do not reteach Exa/Context7, worktrees, or screenshot testing as a testing course.
- Do not initialize a second design system on a repo that already has one — `shadcn init` on the course starter included.

<!-- END @przeprogramowani/10x-cli -->
