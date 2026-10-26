# Local Supabase Stack — Plan Brief

> Full plan: `context/changes/local-supabase-stack/plan.md`
> Research: `context/changes/local-supabase-stack/research.md`

## What & Why

All local work moves off the hosted Supabase project onto a local stack on Docker: `npm run dev`, a local build, and the scripts that hold keys. Today a local sign-up creates a real account, and a local `npm run extract` writes production deals. The coming E2E setup also needs deterministic data with no production secrets. Production, previews and the GitHub Actions pipeline stay on the hosted project.

## Starting Point

- The code already takes its Supabase location from env alone. `.env.local` holds production values.
- The local stack works on this machine: 14/14 migrations, 34 s start from a stopped volume, 4 s when already running.
- One blocker: `collected_posts` gives the pipeline access only through Supabase's default grant, which the installed CLI announces will end on 2026-10-30.

## Desired End State

- `npm run dev` brings the stack up by itself and shows local data: a one-off production snapshot plus a small committed seed.
- `npm run dev:hosted` shows production data when Tomasz wants to check something.
- A local run cannot reach production by mistake: the scripts and `next dev` refuse a URL that does not match `SUPABASE_TARGET`.
- The pipeline's grants are explicit.
- The rules file describes the new loop.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Env layout | Swap: local values in `.env.local`, hosted ones in `.env.hosted.local` | Missing hosted access fails closed instead of falling back to production | Research |
| Production guard | Scripts' client and `next dev` refuse a URL that does not match `SUPABASE_TARGET`; `collect.yml` sets `hosted` in both steps | Production is reachable only where someone wrote it, including in any future CI job | Plan |
| Hosted opt-ins | `npm run dev:hosted` and `npm run extract:report:hosted` | Tomasz wants to check things against production; the 5% sample review is defined over production posts | Plan |
| Local data | Gitignored snapshot from `supabase db dump` (Tomasz, once) + committed `seed.sql` (2 listed, 2 hidden deals, a fresh ok run) | Real volume for daily work, and a deterministic base for a clean checkout and tests | Plan |
| Seeding mechanics | `[db.seed]` stays disabled; `local:reset` passes `--sql-paths` and always `--local` | `db push --include-seed` stays a no-op, and a reset can never target production | Research |
| Starting the stack | `predev` runs `npm run local:start` | Every `npm run dev`, human or agent, starts the same way; +4 s when running | Plan |
| Agent and the local DB | Agent runs `local:start`, `local:stop` and `local:up`; asks before `local:reset`; hosted DDL stays Tomasz's | The agent verifies migrations on real PG 17, and a reset never wipes local accounts unannounced | Plan |
| `collected_posts` grants | `revoke all` from `service_role`, then `grant select, insert, update` | CLAUDE.md's rule: grant exactly what the writer uses, as `post_extractions` does | Research + CLAUDE.md |
| Test-plan §4 | Left to `/10x-test-plan --refresh` | §1–§5 belong to that skill, as in the two previous plans | Plan |

## Scope

**In scope:**
- the grant migration with a no-defaults PGlite test;
- `local:*` scripts that never print keys;
- seed, seed test and the snapshot route;
- the target guard and the `collect.yml` variable;
- the two hosted scripts and Tomasz's env swap;
- CLAUDE.md, `.env.example`, `infrastructure.md` and test-plan §6.

**Out of scope:**
- E2E setup and a guard for a local `build` + `start` (`/10x-e2e-setup` next);
- CI running the stack;
- a preview Supabase project;
- a broad grants audit (test-plan Phase 4);
- a CLI version change;
- test-plan §1–§5.

## Architecture / Approach

One pure predicate, `src/lib/env/supabase-target.ts`, decides whether a URL matches `SUPABASE_TARGET`. Unset means loopback only; `hosted` means non-loopback only. `createCollectorClient()` calls it before any request, and `next.config.ts` calls it in the dev phase only, so Vercel's `next build` is untouched. Node wrappers in `scripts/local/` run the CLI with `--local` and keep keys out of the output. The local database is rebuilt by `local:reset`: migrations, then `snapshot.sql` if present, then `seed.sql`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Grants for `collected_posts` | Explicit pipeline grants, a no-defaults PGlite test, pushed hosted | A missed privilege stops production collection; caught by the test and the next workflow run |
| 2. Local stack scripts, seed and snapshot | `local:*` + `predev`, `seed.sql` with its test, the snapshot route | CLI output leaking keys into the conversation; the wrapper and its test prevent it |
| 3. Target guard and env split | The guard, `SUPABASE_TARGET` in `collect.yml`, `dev:hosted`, `extract:report:hosted`, Tomasz's swap | A workflow typo stops collection until fixed; caught by the first run after merge |
| 4. Documentation | CLAUDE.md, `.env.example`, `infrastructure.md`, test-plan §6 | Docs drifting from the scripts; checked against `package.json` |

**Prerequisites:**
- Docker Desktop running;
- Node 24;
- Tomasz available for `db:push`, the snapshot dump (database password), the env swap and the deny rule.

**Estimated effort:** ~3 agent sessions across 4 phases, plus ~45 min of Tomasz's time.

## Open Risks & Assumptions

- **Snapshot load.** Loading Supabase's data-only dump through `db reset --sql-paths` is the documented route but unproven here, and is checked in Phase 2.
- **Guard import.** Next's config loader is assumed to import the predicate from `next.config.ts`. Check 3.4 proves it.
- **Dev cache.** `.next/dev` may keep inlined `NEXT_PUBLIC_*` values across a local ↔ hosted switch. Check 3.11 catches it.
- **Interim doc.** Test-plan §4 keeps saying dev shares production until `/10x-test-plan --refresh` runs.

## Success Criteria (Summary)

- Opening the local app shows local data, and signing up there touches nothing in production.
- A run with the wrong env stops with a message naming the host, instead of writing to production.
- The production pipeline stays green after the grant push and after the merge.
