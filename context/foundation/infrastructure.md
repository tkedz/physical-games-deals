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
---

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

How Vercel actually operates day to day for this project. One concrete answer per line.

- **Preview deploys**: every push to a non-production branch and every PR gets a unique preview URL automatically via the Git integration. Vercel Authentication (team-members-only access) is free on Hobby for both preview and production; Password Protection is Pro-only ($20/project/mo). Caveat: Hobby cannot connect to a GitHub *organisation*-owned repository — the repo must stay personal. Deployment Protection breaks `VERCEL_URL`-based fetches, so use relative paths.
- **Secrets**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` go in Vercel's project environment variables (they are inlined at build time — changing them requires a redeploy, not a restart). `SUPABASE_SECRET_KEY` does **not** belong on Vercel at all: it is consumed only by the GitHub Actions collector and lives in GitHub Secrets. `VERCEL_TOKEN`, scoped to this project, lives in the shell environment or GitHub Secrets — never in the repository, never pasted into a conversation. Rotation: revoke in Vercel account settings, re-issue, update the one consumer.
- **Rollback**: `vercel rollback <deployment-url>` — takes effect in seconds, no rebuild. **Hobby can only roll back to the immediately previous production deployment**; deeper history requires Pro. This is a traffic-level revert only: it does not undo Supabase schema migrations, so keep migrations backward-compatible with the previous deployment for the length of one rollback window.
- **Approval**: an agent may run `vercel deploy` (preview), `vercel logs`, `vercel rollback`, `vercel inspect` and `vercel env ls` unattended. A human performs, by hand: promoting to production on a release, rotating `SUPABASE_SECRET_KEY` or the Vercel token, deleting the project, any Supabase destructive operation (dropping a table, disabling RLS), and any purchase. The Vercel MCP server is deliberately **not** connected at MVP — it is public beta, grants the same access as the user account, and exposes `buy_pro` / `buy_credits` / `buy_domain`. The CLI covers everything needed and leaves an auditable terminal trail.
- **Logs**: `vercel logs <deployment-url> --json` for machine-readable output, `--follow` to stream (Vercel ends the stream after 5 minutes), `--level error --since 1h` to filter. Hobby retains runtime logs for **one hour** with no log drains, so anything that must survive the night belongs in a Supabase table written by the application, not in platform logs. Build logs: `vercel inspect --logs <deployment-url>`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Adding affiliate links or ads breaches the Hobby non-commercial licence; account or deployment paused | Devil's advocate | M | H | Treat monetisation as a plan change, not a code change: upgrade to Pro ($20/mo) *before* the first affiliate link or ad ships. Nothing in the current PRD monetises, so the trigger is a product decision, not drift. |
| Functions default to `iad1`, adding a transatlantic round trip to every Supabase query | Unknown unknowns | H (if unaddressed) | M | Add `{"regions": ["fra1"]}` to `vercel.json` in the very first deploy, before any traffic. Verify with `vercel inspect` afterwards. |
| RSC prefetch amplifies `proxy.ts` invocations; the 4 CPU-hour Hobby ceiling trips and the site hard-stops for up to 30 days | Pre-mortem | M | H | Check the usage page weekly during the build. If invocations climb without users, set `prefetch={false}` on high-fan-out `<Link>`s. Keep the Pro upgrade as the documented recovery — there is no way to buy out of a Hobby hard stop retroactively. |
| `proxy.ts` runs outside the pinned region on Hobby, so session refresh pays cross-region latency regardless of `fra1` | Devil's advocate | M | M | Keep `proxy.ts` to the single session-refresh call — no extra I/O in that file. Measure real request latency from Poland after the first deploy; if it dominates, migrating to `getClaims()` is the first lever, then Pro's five regions or the Render fallback. |
| `session.ts` uses `getUser()` (server round trip per request) while the current Supabase guide specifies `getClaims()` (local JWKS verification) | Research finding | H (already true) | M | Confirm the Supabase project uses asymmetric signing keys (ECC/RSA), then migrate `updateSession()` to `getClaims()` and update the `CLAUDE.md:23` rule in the same change so the two cannot drift apart. Until then, accept ~230–500 ms of Auth round trip on every request that matches the proxy matcher. |
| One-hour log retention destroys overnight evidence of ingestion or auth failures | Devil's advocate | H | M | Do not rely on platform logs for anything the cron touches. Have the GitHub Actions collector write run outcomes (rows ingested, extraction failures, timestamp) to a Supabase table; the PRD already requires surfacing "last refreshed" to users, so this is shared work. |
| Agent-generated code regresses `src/proxy.ts` to `middleware.ts`, silently disabling session refresh → random logouts | Unknown unknowns | M | H | Already mitigated by the `CLAUDE.md` rule and the comments in `src/utils/supabase/session.ts`. After any auth-adjacent change, verify `src/proxy.ts` still exists and exports `proxy()`; a `middleware.ts` file appearing in the repo is the failure signature. |
| Vendor lock-in through Next-specific features (ISR persistence, `next/image` optimisation, OG image generation) | Research finding | L | M | Exit stays cheap while the app holds no Vercel-coupled state — Supabase is external, the cron is on GitHub Actions. Avoid Vercel-only primitives (Blob, KV, Cron) unless they earn their place; Render is the documented fallback and needs no adapter. |
| `NEXT_PUBLIC_*` is build-time-inlined, so a Supabase key rotation appears to succeed while the old value is still served | Unknown unknowns | L | M | Rotating any `NEXT_PUBLIC_*` value requires a redeploy. Put this on the rotation checklist rather than relying on the environment-variable UI, which gives no such warning. |
| Repository moving under a GitHub organisation silently removes Git-push deploys on Hobby | Devil's advocate | L | M | Keep the repository personal for the MVP. If it must move to an org, that is the same trigger as monetisation: upgrade to Pro. |
| Supabase session cookies leak across users via CDN caching of a response that refreshed tokens | Research finding | M (gap present today) | H | **Open gap.** `@supabase/ssr@0.12.7` passes a second `headers` argument to `setAll` (`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, `Pragma: no-cache`) whose type documentation states that without it "one user's session token can be served to a different user". `src/utils/supabase/session.ts` declares `setAll(cookiesToSet)` and drops that argument. Fix: accept `headers` and apply it with `Object.entries(headers).forEach(([k, v]) => supabaseResponse.headers.set(k, v))`. Especially load-bearing on Vercel, which puts a CDN in front of every response. |

## Getting Started

Commands validated against this repository's pinned versions — `next@16.3.5`, `react@19.2.8`, `@supabase/ssr@0.12.7`, npm, Node 20.20.0 locally — not against generic platform tutorials.

1. **Pin the region before the first deploy.** Create `vercel.json` at the repository root:
   ```json
   { "regions": ["fra1"] }
   ```
   This is the single highest-value step; `iad1` is the default and would put every Server Component a transatlantic hop from Supabase EU. Also pin the build's Node version with an `engines` field in `package.json` (`"engines": { "node": "22.x" }`, or `"20.x"` to match the local runtime) so a platform default change never silently moves the build onto an unsupported runtime.

2. **Install the CLI and link the project non-interactively.**
   ```bash
   npm i -g vercel
   vercel link --yes            # writes .vercel/project.json (orgId, projectId)
   ```
   For CI, export `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` instead — with those set, no command prompts.

3. **Add the environment variables** for Production and Preview, in the dashboard or via `vercel env add`: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). Do **not** add `SUPABASE_SECRET_KEY` — it belongs only in GitHub Secrets, for the collector workflow.

4. **Deploy.**
   ```bash
   vercel deploy --yes                 # preview URL
   vercel deploy --prod --yes          # production
   ```
   Note: the *first* deployment of a new project goes to production whether or not `--prod` is passed.

5. **Verify the two things most likely to be silently wrong**: that the region took effect (`vercel inspect <deployment-url>`), and that `src/proxy.ts` actually ran — sign in, wait past the access-token lifetime, reload, and confirm the session survives. A `proxy.ts` that never executes produces no error, only random logouts later.

6. **Keep the local loop as it is.** `npm run dev` (`next dev`) is the development server for this stack; no platform-native dev command is needed. `vercel dev` exists but adds nothing for a Next.js project on Vercel — reach for it only for non-Next serverless functions.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (the GitHub Actions collector workflow is assumed, not designed here)
- Production-scale architecture (multi-region, HA, DR)
