---
project: physical-games-deals
researched_at: 2026-09-18
recommended_platform: Vercel
runner_up: Cloudflare Workers (@opennextjs/cloudflare)
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Next.js 16.3.5 (App Router)
  runtime: Node.js
decision_status: implemented
deployed_at: 2026-09-19
deploy_mechanism: github-actions → Vercel CLI (`vercel deploy --prebuilt`)
implementation_record: context/deployment/deploy-plan.md
---

## Status

The platform decision below was implemented on 2026-09-19. What actually shipped is recorded in `context/deployment/deploy-plan.md`, which is the authority on the live setup; this file remains the authority on *why* Vercel, and on the risk register.

One thing diverged from what this document assumed. The research treated CI/CD as out of scope and, in passing, described preview and production deploys as arriving through Vercel's **Git integration**. They do not. Deployment runs from **GitHub Actions** calling the Vercel CLI, and the Vercel GitHub App has no access to this repository. The reason is recorded in the deploy plan: `tech-stack.md` specifies `ci_provider: github-actions`, and pre-deploy quality gates (lint and formatting must pass *before* anything reaches production) are impossible under the Git integration, which builds first and reports afterwards. The Git-integration variant is preserved as a costed fallback at `context/deployment/alternative-git-integration.md`.

### How this file records change

Two kinds of section, two rules, because they answer different questions.

**Nothing already written is deleted or rewritten** — the append-only discipline `context/foundation/lessons.md` declares for itself. The Platform Comparison and the Anti-Bias Cross-Check stand exactly as written on 2026-09-18, because they record what was known when the decision was made; where a later finding proved a specific claim wrong, a dated update is appended beneath it rather than edited into it. The Risk Register keeps every row it has ever had: a risk that stops applying keeps its original wording and gains a dated status.

**The Operational Story and the Setup section are kept current instead**, because their whole job is to answer "how does this work today", and an append-only stack of corrections would answer it worse with every entry. Their history lives in git and in the dated records under `context/deployment/`.

## Recommendation

**Deploy on Vercel.**

Vercel is the only candidate where Next.js 16.3.5 and the `proxy.ts` convention are first-party GA rather than a translation layer: Vercel's Routing Middleware docs carry an explicit "Next.js 16 users" note (export `proxy`, Node.js runtime only — Edge is not supported for Next proxy files), so the load-bearing file in this project — `src/proxy.ts`, which refreshes the Supabase session on every request — needs no adapter and no workaround. Cost was the stated top priority and Vercel is the only shortlisted platform that is genuinely **$0**: the Hobby plan covers this app's traffic profile (small user base, low QPS) and, unlike Netlify's free tier, allows pinning functions to a single EU region (`fra1`) so Server Components sit next to the Supabase EU database. With no prior platform familiarity on the team, best-in-class agent-readable docs (`llms.txt`, `llms-full.txt`, `.md` on every docs URL) and a fully non-interactive CLI matter more than they otherwise would.

The decision is made with the Hobby plan's non-commercial licence accepted as a live constraint, not overlooked — see the risk register.

## Platform Comparison

Hard filters applied first:

- **Persistent connections**: not required. Collection *and* LLM extraction run sequentially on a GitHub Actions cron, outside the hosting platform. No platform was dropped by this filter — it is what keeps Vercel and Netlify in the pool at all.
- **Runtime**: Node.js / Next.js 16.3.5. Netlify survives the runtime filter (Next 16 support shipped 2026-09-18, GA) but is effectively blocked on stack fit — see below.

Weights applied after scoring: cost minimisation (stated top priority), no existing familiarity (so CLI and docs quality carry extra weight, and defaults that are wrong-but-silent are penalised), single EU region (edge-native global reach is worth nothing here), external managed services (co-located databases are worth nothing here — Supabase already supplies Postgres + Auth).

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Cost/mo | Total |
|---|---|---|---|---|---|---|---|
| **Vercel** | Pass | Pass | Pass | Pass | Partial (beta) | **$0** | 4.5 |
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass (GA) | $5 | 5.0 |
| **Render** | Pass | Pass | Pass | Partial | Pass (GA) | ~$7–8 | 4.5 |
| **Railway** | Pass | Pass | Pass | Partial | Pass (GA) | $5 floor + usage | 4.5 |
| **Fly.io** | Pass | Partial | Pass | Partial | Partial (experimental) | ~$3.30 | 3.0 |
| **Netlify** | Pass | Pass | Pass | Partial | Pass | $20 (EU region) | 4.5 → blocked |

Per-platform notes on the scores:

- **Vercel** — the CLI is fully non-interactive (`--token`, `--yes`, `--non-interactive` on every command; deploy prints the URL to stdout and exits non-zero on failure). Docs are the strongest in the field: `llms.txt`, `llms-full.txt`, `.md` on any URL, per-page `last_updated` frontmatter. The only Partial is MCP — `https://mcp.vercel.com` is **public beta** (verified 2026-09-18) and exposes purchase tools (`buy_pro`, `buy_credits`, `buy_domain`) with full account scope, which is a poor fit for the production-access posture below. The CLI already covers deploy, promote, rollback and logs, so MCP is not needed at MVP.
- **Cloudflare Workers** — the highest raw score: four **GA** MCP servers (docs, Workers bindings, observability, Code Mode API) and a published Claude Code plugin. It lost on stack fit, not on criteria. Next 16 runs through `@opennextjs/cloudflare@1.20.6`, whose peer range `>=16.3.3` this project's 16.3.5 clears and which added `proxy.ts` support in 1.20.3 — but Cloudflare's own framework guide now names **vinext** (`1.0.0-beta.10`, ~94% API coverage, explicitly not ready for every production workload) as the default path and describes OpenNext as recommended for existing applications only. Also: OpenNext states Windows support is not guaranteed, and this is a Windows 11 development machine. Workers Paid ($5/mo) is effectively required — not for bundle size (the limit rose to 64 MiB on all plans on 2026-09-04) but for the free plan's 10 ms CPU-per-invocation ceiling, which Next SSR plus Supabase auth typically exceeds.
- **Render** — the lowest-risk architecture of the three: a plain long-lived Node process in Frankfurt, so `proxy.ts` behaves exactly as it does locally, with no adapter and no edge runtime anywhere in the path. Partial on deploy API because rollback exists only via the REST endpoint, not as a CLI subcommand. The free instance type spins down after 15 minutes with a ~1-minute cold start, so a user-facing MVP means $7/mo Starter from day one, plus a 5 GB Hobby bandwidth allowance (cut from 100 GB in April 2026) that counts service-initiated egress to Supabase, not just browser responses.
- **Railway** — technically clean (Railpack, long-lived Node server, Amsterdam `europe-west4-drams3a` GA with no plan gate, official MCP since 2026-04-17). Two cost traps: the $5 Hobby fee is a floor rather than a cap, and **build time is metered like runtime**, which punishes exactly the tight redeploy loop a seven-week deadline produces. Node must be pinned via `engines.node` ≥ 20; Railpack's `lts` default has produced real Next 16 build failures.
- **Fly.io** — cheapest on paper (~$3.32/mo for 512 MB; 256 MB will OOM a Next server) and the free tier has been gone since October 2024. Loses on operational surface: you own the Dockerfile, the memory sizing and the machine count (`fly launch` defaults to `--ha`, silently doubling the bill), and **there is no rollback command at all** — rollback means listing releases and redeploying an image by hand. Open upstream issue vercel/next.js#86122 reports `proxy.ts` not executing in production with `output: "standalone"` behind a proxy.
- **Netlify** — scored well and Next 16 support went GA on 2026-09-18, but two findings block it. Open issue opennextjs-netlify#3562: Node middleware (`proxy.ts`) fails during Edge Function bundling on Next 16.3 under both Turbopack and webpack, with no maintainer response and no known workaround — that is this project's session-refresh file. And function region pinning is **Pro-only ($20/mo)**; the default is `cmh` (Ohio), so every Server Component would cross the Atlantic to reach Supabase EU. Overage behaviour is site *suspension*, and production deploys cost 15 of 300 free monthly credits — roughly 20 deploys.

### Shortlisted Platforms

#### 1. Vercel (Recommended)

Wins on the two axes weighted heaviest. **Cost**: $0 on Hobby, against $5 (Cloudflare, Railway), $7–8 (Render) or $20 (Netlify with a usable region). **Stack fit**: Next 16 and `proxy.ts` are native and GA — every other candidate either translates Next through an adapter (Cloudflare, Netlify) or hands you a container to operate (Fly, Railway, Render). With no prior platform experience and a hard 2026-11-04 deadline, first-party support removes an entire class of "is this my bug or the adapter's bug?" debugging. Region pinning to `fra1` is available on Hobby (single region; Pro gets five), which keeps Server Components next to the EU database. CLI and docs are both agent-grade.

#### 2. Cloudflare Workers

Scores 5/5 on the criteria themselves and is the strongest platform in this comparison for *live-infra operability* — four GA MCP servers including observability, plus an official Claude Code plugin. It is the runner-up rather than the pick because the Next.js path is in active transition: Cloudflare is steering new applications toward vinext, which is beta and ~94% API-complete, while the proven path (`@opennextjs/cloudflare`) is positioned for existing applications. Add unguaranteed Windows support and $5/mo, and it loses to a free, first-party alternative on a seven-week runway. Worth re-evaluating in 2027 once vinext is GA.

#### 3. Render

The escape hatch if anything about the serverless model or the Hobby licence becomes a problem. A Render Web Service is just `npm start` on a Node process in Frankfurt — no adapter, no edge runtime, no per-request cold start, and nothing platform-specific about Supabase cookie handling. Everything in the path is GA: CLI v2.28.0, REST API with OpenAPI, deploy hooks, `render.yaml` blueprints, MCP server, `llms.txt` + `llms-full.txt`, first-party agent skills. It costs the most of the three (~$7–8/mo) and its ISR cache is wiped on every deploy without a persistent disk, but it has the fewest moving parts between this repository and a running process.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **The Hobby licence forbids this product's most natural monetisation.** Vercel's Fair Use Guidelines define commercial usage broadly — "advertising the sale of a product or service" and affiliate linking as a primary purpose are both named, as is any deployment used for the financial gain of anyone involved in producing it. A deals aggregator that links to retailers is one affiliate tag away from a breach, and enforcement is an account or deployment pause plus an email, not a bill.
2. **The one file that makes a network call on every request is the one file that cannot be region-pinned.** Hobby allows a single function region and `fra1` is selectable — but Routing Middleware deploys to all regions regardless, and Vercel's docs state that on Hobby it "runs in fewer regions". As currently written, `src/proxy.ts` calls `supabase.auth.getUser()`, a round trip to Supabase EU, on every request; that call may originate outside the region chosen for functions. Moving to `getClaims()` (see Unknown Unknowns) removes the round trip in the common case and largely defuses this weakness.
3. **Hobby overage is a 30-day hard stop, and the safety net is Pro-only.** Vercel's documented behaviour: in most cases, exceeding Hobby usage limits means waiting until 30 days have passed before the feature is usable again. The tightest meter is 4 CPU-hours of Active CPU per month. Spend Management (alerts and auto-actions) does not exist on Hobby, so the first signal is the outage itself.
4. **Runtime logs are retained for one hour on Hobby, with no log drains.** Ingestion runs on a four-hourly cron. Any failure overnight leaves no server-side trace by the time it is noticed.
5. **Hobby teams cannot connect to Git repositories owned by a GitHub organisation.** If this repository ever moves under an org — a cohort's, an employer's — push-to-deploy stops being available and deployment becomes CLI-only until the plan changes.

> **Update 2026-09-19 — weakness 5 no longer applies.** Deployment runs from GitHub Actions through the Vercel CLI; the Git integration was never installed, so there is no push-to-deploy link for an organisation move to break. The pipeline authenticates with a token, and a token does not care who owns the repository. Choosing Actions for a different reason (pre-deploy gates) happened to defuse this one for free.

### Pre-Mortem — How This Could Fail

The MVP shipped on time and cost nothing, which is exactly why nobody revisited the plan. The first assumption was that traffic equals users: `proxy.ts` fires on every request, and Next 16's RSC prefetching turns link hovers into requests — the same shape that took another OpenNext deployment from 300k to 25M requests a day. Invocations climbed without a single new sign-up. The second assumption was that the region default was sensible; it was `iad1`, and for three weeks every Server Component round-tripped Washington to Frankfurt before anyone read the docs. The third was that this was a hobby project. A retailer affiliate link went in "just to test" during a demo, and the account was paused mid-cohort with a policy email rather than an invoice. The recovery was cheap — $20/mo Pro — but it landed in deadline week, and by then the 4 CPU-hour ceiling had already blacked the site out twice, with one hour of log retention to explain either outage. None of this was a Vercel defect. Every item was a Hobby-tier assumption left unexamined because the platform was free.

### Unknown Unknowns

- **The default function region is `iad1` (Washington DC), not your location, and nothing prompts you to change it.** With Supabase in the EU this silently doubles latency on every server-rendered query until `{"regions": ["fra1"]}` lands in `vercel.json`.
- **This repository's session refresh uses the older, more expensive Supabase pattern.** `src/utils/supabase/session.ts` calls `supabase.auth.getUser()`, which is a network round trip to the Auth server on *every* invocation (~230–500 ms). Supabase's current SSR guide specifies `supabase.auth.getClaims()` instead, which verifies the JWT locally via WebCrypto against a cached JWKS — roughly 500 ms once on a cold instance, then ~0–1 ms per call — provided the project uses asymmetric signing keys (ECC/RSA, the default for new projects; a legacy HS256 project falls back to a server call anyway). Because `proxy.ts` invocation count scales with *requests* including RSC prefetches rather than with users, this is the difference between a per-request network hop and a local verification. Switching is a code change plus a `CLAUDE.md` rule change; verify the project's signing-key type in the Supabase dashboard first.
- **The `proxy.ts` rename is newer than most of the internet, but Supabase's docs are not the problem.** Supabase's SSR guide explicitly covers Next 16, names `proxy.ts`, and warns that "on Next.js 15 and earlier, a `proxy.ts` file is never called, so sessions never refresh and users get signed out". The drift risk comes from tutorials, search results and model training data that predate the rename, not from the vendor documentation. The `CLAUDE.md` rule pinning `src/proxy.ts` remains the mitigation.
- **Secrets live in two places from day one, with different rotation mechanics.** The GitHub Actions cron needs `SUPABASE_SECRET_KEY` in GitHub Secrets; Vercel needs its own copy of the public variables. `NEXT_PUBLIC_*` values are inlined at build time on every platform, so rotating the publishable key is a *rebuild*, not an environment-variable update.
- **Deploy health and pipeline health are separate failure domains with no shared dashboard.** The collector never touches Vercel, so Vercel's status is green while ingestion has been failing for two days. Monitoring the deployment tells you nothing about whether the product has data.
- **The first `vercel deploy` of a new project goes to production even without `--prod`.** There is no staging-by-default safety step.

## Operational Story

How Vercel actually operates day to day for this project. One concrete answer per line. Reconciled 2026-09-19 against the shipped pipeline; `context/deployment/deploy-plan.md` carries the full detail.

- **Deploy trigger**: `.github/workflows/ci.yml`. A `verify` job (`npm ci`, `npm run lint`, `npm run format:check`) gates a `deploy` job that runs `vercel pull`, `vercel build`, then `vercel deploy --prebuilt`. Push to `main` selects production, any other ref selects preview. `next build` runs inside `vercel build`, so a type error fails the pipeline before a deployment exists. Vercel's Git integration is **not** installed.
- **Preview deploys**: created by the same workflow on every pull request, and the URL is posted back as a PR comment by the job. They are *not* automatic on every branch push — only refs that open a pull request, or a manual run, produce one. Previews answer `302` to `vercel.com/sso-api` for anyone not signed in to the Vercel account: that is Vercel Authentication, free on Hobby, not a misconfiguration. Password Protection is Pro-only ($20/project/mo). Deployment Protection breaks `VERCEL_URL`-based fetches, so use relative paths. Previews currently read and write the **production** Supabase project — harmless while the schema is empty, but the fix once there is data is a separate Supabase project, not separate keys.
- **Secrets**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` live in Vercel's project environment variables for Production and Preview; `vercel pull` fetches them into the runner at build time, which is required because `NEXT_PUBLIC_*` is inlined into the bundle rather than read at runtime. Rotating either one therefore needs a **redeploy**, not an env update. GitHub repository secrets hold `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (the last two are identifiers, not credentials). `SUPABASE_SECRET_KEY` belongs only in GitHub Secrets for the future collector workflow — never on Vercel, never in the browser. **The Vercel token must be account-scoped ("All projects").** Project-scoped tokens are rejected by the CLI, which performs an account-level identity lookup on essentially every command including `vercel pull`; the error is `User not found. (404)`, which reads like a bad paste and is not. Rotation: revoke, re-issue, update the one GitHub secret.
- **Rollback**: `vercel rollback <deployment-url>` — takes effect in seconds, no rebuild. **Hobby can only roll back to the immediately previous production deployment**; deeper history requires Pro. This is a traffic-level revert only: it does not undo Supabase schema migrations, so keep migrations backward-compatible with the previous deployment for the length of one rollback window.
- **Approval**: deployment is not an agent action at all — it is a merge to `main`, gated by `verify`. An agent may run the read-only commands unattended: `vercel logs`, `vercel inspect`, `vercel env ls`, `vercel ls`, plus `vercel rollback` as the one reversal it may perform. A human performs, by hand: rotating `SUPABASE_SECRET_KEY` or the Vercel token, deleting the project, any Supabase destructive operation (dropping a table, disabling RLS), and any purchase. The Vercel MCP server is deliberately **not** connected at MVP — it is public beta, grants the same access as the user account, and exposes `buy_pro` / `buy_credits` / `buy_domain`. The CLI covers everything needed and leaves an auditable terminal trail.
- **Logs**: `vercel logs <deployment-url> --json` for machine-readable output, `--follow` to stream (Vercel ends the stream after 5 minutes), `--level error --since 1h` to filter. Hobby retains runtime logs for **one hour** with no log drains, so anything that must survive the night belongs in a Supabase table written by the application, not in platform logs. Build logs: `vercel inspect --logs <deployment-url>`.

## Risk Register

Rows are never deleted or rewritten. A risk that stops applying keeps its original wording and gains a dated status, so the register reads as a history as well as a current state — the same append-only discipline `context/foundation/lessons.md` declares for itself.

| Risk | Status | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| Adding affiliate links or ads breaches the Hobby non-commercial licence; account or deployment paused | Open | Devil's advocate | M | H | Treat monetisation as a plan change, not a code change: upgrade to Pro ($20/mo) *before* the first affiliate link or ad ships. Nothing in the current PRD monetises, so the trigger is a product decision, not drift. |
| Functions default to `iad1`, adding a transatlantic round trip to every Supabase query | Closed 2026-09-19 | Unknown unknowns | — | — | `vercel.json` pins `{"regions": ["fra1"]}` and `vercel inspect` confirms `fra1` on every lambda, production and preview. Related trap that remains true: the build log says `Running build in Washington, D.C. – iad1`, which is Vercel's build infrastructure, is not configurable on Hobby, and says nothing about where functions run. |
| RSC prefetch amplifies `proxy.ts` invocations; the 4 CPU-hour Hobby ceiling trips and the site hard-stops for up to 30 days | Open | Pre-mortem | M | H | Check the usage page weekly during the build. Baseline from the first production deployment: 2 CPU-minutes billable. If invocations climb without users, set `prefetch={false}` on high-fan-out `<Link>`s. Keep the Pro upgrade as the documented recovery — there is no way to buy out of a Hobby hard stop retroactively. |
| The CI token is account-scoped ("All projects"), wider than the job needs, and lives in a GitHub repository secret | Open | Research finding | M | H | Forced, not chosen: Vercel's project-scoped tokens are rejected by the CLI (`User not found. (404)`). Mitigations in force — shortest tolerable expiry, the token is passed via `env:` rather than on a command line the runner echoes, and rotation touches exactly one secret. Revisit if Vercel ships CLI support for project-scoped tokens, or replace the token with OIDC federation. |
| `proxy.ts` runs outside the pinned region on Hobby, so session refresh pays cross-region latency regardless of `fra1` | Open | Devil's advocate | M | M | Keep `proxy.ts` to the single session-refresh call — no extra I/O in that file. Measure real request latency from Poland after the first deploy; if it dominates, migrating to `getClaims()` is the first lever, then Pro's five regions or the Render fallback. |
| `session.ts` uses `getUser()` (server round trip per request) while the current Supabase guide specifies `getClaims()` (local JWKS verification) | Open | Research finding | H (already true) | M | Confirm the Supabase project uses asymmetric signing keys (ECC/RSA), then migrate `updateSession()` to `getClaims()` and update the `CLAUDE.md:23` rule in the same change so the two cannot drift apart. Until then, accept ~230–500 ms of Auth round trip on every request that matches the proxy matcher. |
| One-hour log retention destroys overnight evidence of ingestion or auth failures | Open | Devil's advocate | H | M | Do not rely on platform logs for anything the cron touches. Have the GitHub Actions collector write run outcomes (rows ingested, extraction failures, timestamp) to a Supabase table; the PRD already requires surfacing "last refreshed" to users, so this is shared work. |
| Agent-generated code regresses `src/proxy.ts` to `middleware.ts`, silently disabling session refresh → random logouts | Open | Unknown unknowns | M | H | Already mitigated by the `CLAUDE.md` rule and the comments in `src/utils/supabase/session.ts`. After any auth-adjacent change, verify `src/proxy.ts` still exists and exports `proxy()`; a `middleware.ts` file appearing in the repo is the failure signature. |
| Vendor lock-in through Next-specific features (ISR persistence, `next/image` optimisation, OG image generation) | Open | Research finding | L | M | Exit stays cheap while the app holds no Vercel-coupled state — Supabase is external, the cron is on GitHub Actions. Avoid Vercel-only primitives (Blob, KV, Cron) unless they earn their place; Render is the documented fallback and needs no adapter. |
| `NEXT_PUBLIC_*` is build-time-inlined, so a Supabase key rotation appears to succeed while the old value is still served | Open | Unknown unknowns | L | M | Rotating any `NEXT_PUBLIC_*` value requires a redeploy. Put this on the rotation checklist rather than relying on the environment-variable UI, which gives no such warning. |
| Repository moving under a GitHub organisation silently removes Git-push deploys on Hobby | Not applicable from 2026-09-19 | Devil's advocate | — | — | No Git integration exists to break; the pipeline deploys with a token from GitHub Actions. An organisation move would need the secrets re-created, nothing more. |
| Supabase session cookies leak across users via CDN caching of a response that refreshed tokens | Closed 2026-09-18 | Research finding | — | — | `src/utils/supabase/session.ts` now declares `setAll(cookiesToSet, headers)` and applies the library's cache headers (`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, `Pragma: no-cache`) to `supabaseResponse`. Keep the second argument in place through any refactor of that file — dropping it is silent, and the failure mode is one user being served another's session. |

## Setup — done, and what remains

Superseded as a to-do list on 2026-09-19; kept as a checklist of what the live project rests on. Step-by-step execution and evidence are in `context/deployment/deploy-plan.md`.

In place:

1. **Region pinned.** `vercel.json` holds `{ "regions": ["fra1"] }`. Confirmed on every lambda with `vercel inspect`, production and preview. This was the highest-value step — `iad1` is the default and would have put every Server Component a transatlantic hop from Supabase EU.
2. **Node pinned to 24.x** in `package.json` `engines` and in `.nvmrc`, so the CI runner and the Vercel build agree and a platform default change cannot silently move either.
3. **Project linked by identifier, not by interactive login.** `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are GitHub secrets; the workflow never runs `vercel link`. Worth knowing if you ever do run it locally: it writes a `VERCEL_OIDC_TOKEN` into `.env.local`.
4. **Environment variables** for Production and Preview hold `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). `SUPABASE_SECRET_KEY` is deliberately absent — it belongs only in GitHub Secrets, for the collector workflow.
5. **Deployment runs from CI**, never from a laptop: `vercel pull` → `vercel build` → `vercel deploy --prebuilt`, behind a `verify` gate. The gate has been proven to block — a deliberate lint warning turned `verify` red and no deployment was created.

Still open:

6. **The conclusive `proxy.ts` test is deferred.** Region and pipeline are verified; session refresh is not. The proof is: sign in, wait past the access-token lifetime, reload, confirm the session survives. It needs a login UI and an `/auth/callback` route first, so it is the acceptance test for whichever change introduces auth. A `proxy.ts` that never executes produces no error — only random logouts later.
7. **That a type error blocks the deploy** follows from the pipeline's shape but has not been exercised. Cheapest moment to confirm is the first real code change.

Unchanged: **the local loop.** `npm run dev` (`next dev`) is the development server for this stack; no platform-native dev command is needed. `vercel dev` exists but adds nothing for a Next.js project on Vercel — reach for it only for non-Next serverless functions.

## Out of Scope

The following were not evaluated in **this research**:
- Docker image configuration
- Production-scale architecture (multi-region, HA, DR)

CI/CD was out of scope here and was designed afterwards — see `context/deployment/deploy-plan.md`. The four-hourly collector workflow is still only assumed: it lands in the same `.github/workflows/` directory, needs `SUPABASE_SECRET_KEY`, and copies this pipeline's pattern.
