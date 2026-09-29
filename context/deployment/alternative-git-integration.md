---
project: physical-games-deals
status: superseded
superseded_on: 2026-09-19
superseded_by: GitHub Actions deploy pipeline
platform: Vercel
---

# Alternative: deploy via Vercel's Git integration

## Status

**Not the chosen path.** Kept as a costed, ready-to-execute fallback.

This was the first deployment plan, written on 2026-09-18. It was replaced on
2026-09-19 with a GitHub Actions pipeline, for two reasons:

1. `context/foundation/tech-stack.md` records `ci_provider: github-actions` from
   the stack-selection step. The Git-integration plan cited that same file as
   support, which was a misreading: `ci_default_flow: auto-deploy-on-merge` says
   *when* to deploy, not *what* deploys. The two keys together mean "Actions
   deploy on merge".
2. Pre-deploy quality gates (lint, format, build must pass before anything
   reaches production) were wanted, and Vercel's Git integration builds first and
   asks questions later.

`context/foundation/infrastructure.md` never designed a deploy pipeline at all —
its Out of Scope section says so explicitly. Its Operational Story assumed the
Git integration in passing, and this plan inherited that assumption.

## How to switch back to this path

Cheap, and needs no application code change. The repository holds nothing
specific to either deploy mechanism.

1. Install the Vercel GitHub App and grant it access to **this repository only**
   (`Only select repositories`). The Vercel project already exists by then, so
   it is a connect, not a create.
2. Delete or disable the `deploy` job in `.github/workflows/`. Leaving both
   active produces double deployments of every commit.
3. Keep the `verify` job — quality gates are still worth having, and they are
   independent of who deploys.

The one real difference is **where the build runs**: the Actions pipeline builds
in the runner and ships a prebuilt artifact (`vercel deploy --prebuilt`), while
the Git integration builds on Vercel's infrastructure. Switching back moves the
build minutes from GitHub to Vercel.

Trigger to reconsider: GitHub Actions minutes becoming a constraint (relevant
only if this repository is private — public repositories get unlimited free
Actions minutes).

---

## Original plan, verbatim (2026-09-18)


## Context

`context/foundation/infrastructure.md` (researched 2026-09-18) picked **Vercel** as the MVP platform for this Next.js 16.3.5 + Supabase app, after scoring six candidates. Vercel is the only platform this plan touches; the runners-up stay on paper, and are named here only where a fallback is actionable. Nothing has been deployed yet: there is no `vercel.json`, no `.vercel/` link, no `engines` pin, and no `.github/workflows/`. The app itself is still the stock create-next-app page — that is fine and intentional here.

The goal is to prove the pipeline end to end (repo → build → production URL → `proxy.ts` executing against Supabase) **before** any feature code depends on it, so that the first time a real page breaks in production, the deployment path is not also a suspect. Two decisions from `infrastructure.md` are load-bearing and must land in the very first deploy, because they are silent-by-default failures:

1. Vercel functions default to `iad1` (Washington DC). Supabase is in the EU. Without a region pin every Server Component pays a transatlantic round trip, and nothing warns you.
2. Node is unpinned, so Vercel picks its own default and can move it under you.

**Scope: deploy only.** No application code changes. The `getUser()` → `getClaims()` migration and the landing page stay deferred (see *Explicitly deferred*).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Deploy trigger | **Git integration** — push to `main` = production, PR = preview | Matches `tech-stack.md` (`ci_default_flow: auto-deploy-on-merge`). Repo is personal-owned (`tkedz`), which Hobby requires. |
| Node version | **24.x**, pinned in `engines` + `.nvmrc` | User runs Node 24 for this project; `.nvmrc` makes `nvm use` automatic and removes the "forgot to switch" failure mode. |
| Region | **`fra1`** via `vercel.json` | Co-locate functions with the EU Supabase database. |
| Vercel MCP | **Not connected** | Public beta, account-wide scope, exposes purchase tools. CLI covers everything at MVP (`infrastructure.md` operational story). |

## Step 1 — Repo changes (agent, committed before anything is imported)

Three small files, then a local build gate.

- **Create `vercel.json`** at the repo root:
  ```json
  { "regions": ["fra1"] }
  ```
- **Edit [package.json](package.json)** — add an `engines` field next to `private`:
  ```json
  "engines": { "node": "24.x" }
  ```
- **Create `.nvmrc`** at the repo root containing `24`.
- Run `npm run build` and `npm run lint` locally. `next.config.ts` sets no `ignoreBuildErrors` / `ignoreDuringBuilds`, so a type or lint error fails the Vercel build too — catching it here is cheaper. Per `CLAUDE.md`, these two commands are the verification story; there is no test runner.
- Commit (`Pin deploy region and Node version`) and push to `main`. Push **before** the import so the very first build already carries the region pin.

`.gitignore` already covers `.vercel` and `.env*` (with `!.env.example`), so nothing else needs guarding.

## Step 2 — Vercel account and CLI (human, manual gate)

1. Confirm a Vercel account exists on the **personal** scope (Hobby cannot connect repos owned by a GitHub organisation).
2. `npm i -g vercel`, then `vercel login`. The CLI is currently not installed (`vercel: command not found`).

## Step 3 — Import the project (human, manual gate)

In the Vercel dashboard: **Add New → Project → import `tkedz/physical-games-deals`**.

- Framework preset auto-detects Next.js; root directory `./`; leave build/output commands at defaults.
- **Enter the environment variables on the import screen, before clicking Deploy.** The first deployment of a new project goes straight to production whether or not `--prod` is passed — there is no staging-by-default step to catch a missing variable.
- Add exactly two variables, to **Production and Preview**, copied by hand from `.env.local` (I will not read that file, and the values must never appear in this conversation):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Do **not** add `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `RAWG_API_KEY` or `OPENROUTER_API_KEY`. `SUPABASE_SECRET_KEY` bypasses RLS and belongs only in GitHub Secrets for the future collector; nothing in `src/` reads any of the others.
- After the import, check **Project Settings → General → Node.js Version** shows 24.x. If 24.x is not offered, the build fails fast with an invalid-Node-version error — in that case fall back to `22.x` in both `package.json` and `.nvmrc`.

## Step 4 — Link the local checkout (agent)

```bash
vercel link --yes      # writes .vercel/project.json (orgId, projectId) — gitignored
```

Needed so `vercel inspect`, `vercel logs`, `vercel env ls` and `vercel rollback` work from this directory without arguments.

## Step 5 — Verification (agent, read-only)

Everything here is non-mutating and safe to run unattended.

1. **Region actually took effect** — `vercel inspect <deployment-url>` and confirm `fra1`, not `iad1`. This is the single highest-value check; a wrong region is invisible except as latency.
2. **Build ran on Node 24** — `vercel inspect --logs <deployment-url>`, grep the build log for the Node version.
3. **The site responds** — `curl -sI <production-url>` expects `200`.
4. **Environment variables are present** — `vercel env ls` (prints names and targets, never values). Confirm both `NEXT_PUBLIC_*` names against Production and Preview.
5. **`proxy.ts` executed** — request the production URL, then `vercel logs <deployment-url> --json` and confirm a proxy/middleware invocation is recorded. Note the indirect proof: [src/proxy.ts](src/proxy.ts) runs on every non-static path and calls `updateSession()` → `supabase.auth.getUser()`, so a `200` with correctly-set env vars means the Supabase client constructed and the call did not throw.
6. **Preview deploys work** — push a throwaway branch and open a PR; confirm a unique preview URL appears and builds green. Delete the branch afterwards.

The full session-survival test from `infrastructure.md` (sign in, wait past the access-token lifetime, reload, confirm the session persists) **cannot run yet** — there is no login UI and no `/auth/callback` route. Record it as the acceptance test for whichever change introduces auth; a `proxy.ts` that never executes produces no error, only random logouts later.

## Step 6 — Record the artifact (agent)

Create `context/deployment/deploy-plan.md` (the directory does not exist yet). Written in English per `CLAUDE.md`. It is the audit trail the next lesson's milestone planning reads as ground truth, so it records what was *actually* done, not just what was planned:

- Production URL, project name, Vercel scope, region, Node version.
- Which secret lives where: `NEXT_PUBLIC_*` → Vercel (Production + Preview); `SUPABASE_SECRET_KEY` → GitHub Secrets only, not yet created; `VERCEL_TOKEN` → not yet issued.
- Deploy trigger (push to `main`), rollback command (`vercel rollback <url>`), and the Hobby limitation that rollback reaches only the immediately previous production deployment.
- Verification results from Step 5, with the deferred session test named explicitly.
- Approval boundary from `infrastructure.md`: agent may run `deploy` (preview), `logs`, `rollback`, `inspect`, `env ls`; a human performs production promotion on a release, any key rotation, project deletion, any Supabase destructive operation, and any purchase.

Commit it.

## Explicitly deferred (not in this deployment)

- **`getUser()` → `getClaims()` in [src/utils/supabase/session.ts](src/utils/supabase/session.ts)** — risk register rates this H/already-true: a network round trip to Supabase Auth on every matching request, including RSC prefetches. Needs the Supabase project's signing-key type confirmed (asymmetric ECC/RSA) and the `CLAUDE.md` rule updated in the same change so the two cannot drift. Its own change, after the pipeline is proven.
- **Landing page and metadata** — [src/app/page.tsx](src/app/page.tsx) is the create-next-app template and [src/app/layout.tsx](src/app/layout.tsx) still says `title: "Create Next App"`. Cosmetic; ships with the first real feature.
- **Supabase auth redirect URLs** — the production domain must be added to Supabase → Authentication → URL Configuration before login works. `supabase/config.toml` currently points at `127.0.0.1:3000`, which is local-only. Blocked on there being a login flow at all.
- **GitHub Actions collector, `VERCEL_TOKEN`, database migrations** — `supabase/migrations/` is empty; there is no schema yet. Out of scope for a first deploy.
- **Custom domain, Vercel MCP server, Spend Management** (Pro-only anyway).

## Risks carried into production from `infrastructure.md`

These are accepted, not solved, and belong in the artifact so they are not rediscovered under deadline pressure:

- **Hobby is non-commercial.** The first affiliate link or ad is a plan change ($20/mo Pro), not a code change. Enforcement is an account pause plus an email, not a bill. If the licence ever blocks the product, `infrastructure.md` already scored Render as the pre-researched fallback (~$7–8/mo, a plain Node process, no adapter) — that is the only reason another platform is named in this plan, and switching needs no new research because nothing in the app is Vercel-coupled.
- **4 CPU-hours/month is the tightest meter**, and exceeding Hobby limits can mean waiting out a 30-day window. Spend Management is Pro-only, so the first signal is the outage. Check the usage page weekly during the build; if invocations climb without users, RSC prefetch is the likely cause and `prefetch={false}` on high-fan-out links is the lever.
- **One-hour runtime log retention, no log drains.** Anything that must survive the night belongs in a Supabase table written by the application, not in platform logs.
- **A `middleware.ts` file appearing in the repo is the failure signature** for silently disabled session refresh. Verify `src/proxy.ts` still exists and exports `proxy()` after any auth-adjacent change.
