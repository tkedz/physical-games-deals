---
project: physical-games-deals
planned_at: 2026-09-18
deployed_at: 2026-09-19
platform: Vercel
plan: Hobby
scope: tkedz (personal)
region: fra1
node: 24.x
deploy_trigger: github-actions (push to main)
status: deployed
---

# First production deployment — Vercel via GitHub Actions

## What was deployed

| | |
|---|---|
| Production URL | https://physical-games-deals.vercel.app |
| First production deployment | `physical-games-deals-hfwcmnyo7-tkedz.vercel.app` |
| Vercel project | `tkedz/physical-games-deals`, personal scope, Hobby plan |
| Function region | `fra1` (Frankfurt) — production **and** preview |
| Node version | 24.x, pinned in `package.json` `engines` and `.nvmrc` |
| Deploy mechanism | GitHub Actions → Vercel CLI → `vercel deploy --prebuilt` |
| Git integration | **Not installed.** The Vercel GitHub App has no access to this repository |

The application itself is still the stock create-next-app page. That was intentional: the point of this deployment was to prove the pipeline before feature code depends on it.

## Why Actions rather than Vercel's Git integration

`context/foundation/tech-stack.md` records `ci_provider: github-actions`. `context/foundation/infrastructure.md` never designed a deploy pipeline — its Out of Scope section says so — and its Operational Story assumed the Git integration in passing. The first version of this plan inherited that assumption and was corrected.

The deciding requirement was **pre-deploy quality gates**: lint and formatting must pass before anything reaches production. Vercel's Git integration builds first and reports afterwards, so it cannot provide that.

The Git-integration variant is preserved at `alternative-git-integration.md` with switch-back steps, in case Actions minutes become a constraint. This repository is private today (2000 free Actions minutes/month); when it becomes public, Actions minutes stop being metered.

## The pipeline

`.github/workflows/ci.yml`, two jobs, on push to `main` and on every pull request.

**`verify`** — `npm ci`, `npm run lint`, `npm run format:check`. No build here, deliberately: the build happens once per pipeline, inside `vercel build`.

**`deploy`** — `needs: verify`, so a red gate stops it:
1. `vercel pull` fetches the project's environment variables into the runner, which matters because `NEXT_PUBLIC_*` values are inlined at build time
2. `vercel build` — this is where `next build` runs; a type error fails here, before any deployment exists
3. `vercel deploy --prebuilt` — ships the built output, writes the URL to the job summary, and comments it on pull requests

`main` selects production, any other ref selects preview. `concurrency: cancel-in-progress` kills superseded runs.

## Verification results

| Check | Result |
|---|---|
| Workflow green | Yes — deployment `Ready`, Production, 10s |
| Function region | `fra1` on every lambda, production and preview (`vercel inspect`) |
| Node version | Runner on 24.20.0; Vercel project reports `24.x` |
| Production responds | `HTTP/1.1 200 OK` |
| Environment variables | Both `NEXT_PUBLIC_*` names present for Production and Preview (`vercel env ls`) |
| Gate blocks a deploy | **Proven.** A deliberate lint warning on a branch turned `verify` red, `deploy` never started, and no deployment was created |
| Preview on pull request | **Proven.** A distinct preview URL was created while production stayed on its existing deployment |
| `proxy.ts` executed | Strong indirect evidence only — see below |

### On `proxy.ts`

Runtime logs record an entry per request (`GET /`, `HEAD /`) and the page is statically prerendered, so the only server-side code on that path is `src/proxy.ts`. It also calls `supabase.auth.getUser()`, which would throw on missing environment variables, and the response is `200`. Consistent with the proxy running, but not conclusive.

**The conclusive test is deferred**: sign in, wait past the access-token lifetime, reload, confirm the session survives. It cannot run until there is a login UI and an `/auth/callback` route. It is the acceptance test for whichever change introduces auth. A `proxy.ts` that never executes produces no error, only random logouts later.

### Not proven

The gate was exercised against a **lint** failure. That a **type** error also blocks the deploy follows from the pipeline's shape — `vercel build` runs `next build` and the deploy step comes after it — but was not exercised in practice. Cheapest moment to confirm is the first real code change.

## Where each secret lives

| Secret | Location | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel project env (Production + Preview) | Same value in both — one Supabase project exists |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel project env (Production + Preview) | As above |
| `VERCEL_TOKEN` | GitHub repository secret | Account-scoped ("All projects") — see the token finding below |
| `VERCEL_ORG_ID` | GitHub repository secret | Identifier, not a credential |
| `VERCEL_PROJECT_ID` | GitHub repository secret | Identifier, not a credential |
| `SUPABASE_SECRET_KEY` | GitHub Secrets, **not yet created** | For the future collector workflow only. Never on Vercel, never in the browser |

`NEXT_PUBLIC_*` values are inlined at build time, so rotating either one requires a **redeploy**, not an environment-variable update. The Vercel UI gives no such warning.

Preview deployments currently read and write the **production** Supabase project. Harmless today — the one table holds no rows, has no policy and no deployed code reads it; once there is data and there are mutations, the right fix is a separate Supabase project for preview, not separate keys against the same one.

## Operational commands

- **Rollback**: `vercel rollback <deployment-url>` — seconds, no rebuild. **Hobby reaches only the immediately previous production deployment**; deeper history needs Pro. Traffic-level revert only: it does not undo Supabase schema migrations.
- **Logs**: `vercel logs <deployment-url> --json`, `--follow` to stream (ends after 5 minutes), `--level error --since 1h` to filter. Hobby retains runtime logs for **one hour** with no log drains.
- **Inspect**: `vercel inspect <deployment-url>` shows the function regions and the build output; `--logs` adds the build log.
- **Migrations**: the schema lives in `supabase/migrations/` and is applied by a human with `npm run db:push`, never from CI. `npm run db:push -- --dry-run` first, `npm run db:check` after — the security advisor with `--fail-on error`, which refuses a table in `public` without row-level security. `npm run db:status` is the drift check. Full rules in `CLAUDE.md`.

## Approval boundary

An agent may run `vercel logs`, `vercel inspect`, `vercel env ls`, `vercel ls` and `vercel rollback` unattended. A human performs, by hand: rotating `SUPABASE_SECRET_KEY` or the Vercel token, deleting the project, any Supabase destructive operation (dropping a table, disabling RLS), and any purchase.

The Vercel MCP server is deliberately **not** connected: it is public beta, carries account-wide scope, and exposes `buy_pro` / `buy_credits` / `buy_domain`. The CLI covers everything needed and leaves an auditable trail.

## Findings worth keeping

1. **Vercel's project-scoped tokens do not work with the Vercel CLI.** They deny every user-level and team-level request, while the CLI performs an account-level identity lookup on essentially every command — including `vercel pull`. The symptom is `Error: User not found. (404)`, which reads like a malformed token and is not. The CI token must be account-scoped ("All projects"). Verified 2026-09-19; cost two CI runs to diagnose.
2. **`eslint` exits 0 on warnings.** The original `verify` job would have passed an unused variable straight through. `npm run lint` is now `eslint --max-warnings 0`. The repository had zero warnings when this was tightened.
3. **Build region and function region are different things.** The deploy log says `Running build in Washington, D.C. – iad1`; that is Vercel's build infrastructure, is not configurable on Hobby, and says nothing about where functions run. `vercel.json` `regions` controls the functions, and `vercel inspect` is what confirms it.
4. **`vercel link` writes to `.env.local`**, adding a `VERCEL_OIDC_TOKEN`. Harmless (the file is gitignored) but surprising, and worth knowing before running it against a file you care about.
5. **Preview deployments return `302` to `vercel.com/sso-api`** by default. That is Vercel Authentication, free on Hobby, not a misconfiguration. Anyone signed in to the Vercel account sees the preview normally.

## Deferred

- **`getUser()` → `getClaims()`** in `src/utils/supabase/session.ts` — the risk register rates it H / already true: a network round trip to Supabase Auth on every matching request, including RSC prefetches. Needs the Supabase signing-key type confirmed (asymmetric ECC/RSA) and the `CLAUDE.md` rule updated in the same change.
- **Landing page and metadata** — `src/app/page.tsx` is the create-next-app template; `layout.tsx` still declares `title: "Create Next App"`.
- **Supabase auth redirect URLs** — the production domain must reach Supabase → Authentication → URL Configuration before login works. `supabase/config.toml` points at `127.0.0.1:3000`. Blocked on there being a login flow.
- **Collector workflow** — the four-hourly cron lands in the same `.github/workflows/` directory and needs `SUPABASE_SECRET_KEY`. This pipeline is the pattern it will copy.
- **Manual production gate** — a GitHub Environment named `production` with a required reviewer, if `auto-deploy-on-merge` ever stops feeling right.
- **Custom domain, Vercel MCP, Spend Management** (Pro-only anyway).

## Risks carried into production

Accepted, not solved. Full register in `context/foundation/infrastructure.md`.

- **The CI token is wider than the job needs**, because the CLI cannot use project-scoped tokens. Mitigation: shortest tolerable expiry, rotate by revoking and updating one secret, never echo it in workflow logs. Revisit if Vercel fixes CLI support, or replace it with OIDC federation.
- **Hobby is non-commercial.** The first affiliate link or ad is a plan change ($20/mo Pro), not a code change; enforcement is an account pause plus an email. Render is the pre-researched fallback.
- **4 CPU-hours per month is the tightest meter**, and exceeding Hobby limits can mean waiting out a 30-day window. Spend Management is Pro-only, so the first signal is the outage. The first deployment reported 2 CPU-minutes billable — worth watching the usage page weekly for the first few weeks to see how that accumulates.
- **One-hour log retention, no log drains.** Anything that must survive the night belongs in a Supabase table written by the application.
- **A `middleware.ts` file appearing in the repository** is the failure signature for silently disabled session refresh. After any auth-adjacent change, verify `src/proxy.ts` exists and exports `proxy()`.
