# Game pages, public search on `/`, merged watchlist and RAWG images — Plan Brief

> Full plan: `context/changes/game-search-and-pages/plan.md`
> Frame brief: `context/changes/game-search-and-pages/frame.md`
> Research: `context/changes/game-search-and-pages/research.md`
> Date: 2026-10-27

## What & Why

> **The actual problem to plan around is**: give anyone, signed in or not, a page per catalogue game that lists the deals matching it, without public traffic exhausting the shared RAWG quota — and re-home the search and the watchlist around that page.

This is M-2's only slice (S-05, PRD FR-009). The game page is new ground. The search on `/`, the merged list and the images relocate and present parts that already exist.

## Starting Point

- Matched deals exist only per signed-in user (`public.matched_deals`, keyed on `auth.uid()`), and `anon` may execute none of the matching functions.
- The RAWG catalogue has a search and no lookup, and nothing caches, throttles or retries it.
- The search and the list live together on private `/watchlist`, which the deploy-gating E2E pins.
- Nothing renders RAWG's images yet.

## Desired End State

- `/games/<RAWG id>` is public and `noindex`. It shows the game's name, image and watch control, then every listed deal an unpinned entry for it would match. A game cached earlier survives a RAWG outage.
- `/` keeps its public list and gains a search above it, whose results float over the list without moving it. Guests get a sign-in link where the watch buttons would be.
- `/my-deals` holds both the matched deals and the list, and `/watchlist` redirects there.
- RAWG is reached through one provider-neutral cache, so visitors cannot cheaply drain the quota.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Audience | Search and game pages are public; an account is needed only to watch | Tomasz's answer | Frame |
| Matching rule | What an unpinned game entry with the catalogue `name` matches; no new rule | FR-009 plus the S-04 rule, unchanged | Frame |
| Match path for `anon` | Invoker `public.deals_for_game(name)` plus definer `private.game_key` in a new unexposed schema `private` | Helper grants and the four-function truth table stay; RLS keeps the listed predicate in its three places | Plan — decided by the orchestrator from CLAUDE.md and S-04 review F1, not asked; Tomasz was told and did not object |
| Game URL | `/games/<RAWG id>`, no provider prefix | The id is already as provider-specific as `watchlist_entries.game_id`; one key for RAWG and the cache | Plan (Q2) |
| RAWG quota | Cache only, wrapping `GameCatalog`, provider and shape version in every key; search 24 h, game 7 days; failures never stored; WAF deferred with a register row | Tomasz may switch to IGDB, so the cache must survive a provider switch unchanged | Plan (Q3, Tomasz's own answer) |
| Unknown id | 404; "not found" is a cached answer, not a failure | A repeated bad id costs RAWG once | Plan |
| RAWG down on a game page | A game seen before renders from the cache; an unseen one shows the one generic message with a link to `/` | Same message as the search; no URL text on the page | Plan (Q4) |
| Indexing | `noindex` on `/games/…` and `/?q=…`, no sitemap | Nothing public links there, so crawlers cost RAWG nothing | Plan (Q5) |
| Search URL | `?page`, `?q` and `?platform` coexist; closing the overlay drops `q` and `platform` | Shareable searches; the server-side `next/form` GET stays | Plan (Q6) |
| Images | RAWG's resized files (420 and 640) via `next/image` `unoptimized`; mapping only in `rawg.ts` | No Vercel image quota and no `/_next/image` abuse surface | Plan (Q7) |
| Guest wants to watch | „Zaloguj się, aby obserwować” → `/login`, landing on `/` afterwards | No return parameter to secure | Plan (Q8) |
| Watch on the game page | Yes, the same control as in the results (platform select, „Na liście”, guest link) | Tomasz chose it **against the recommendation**; it adds a second place, which S-05 does not forbid | Plan (Q9) |
| Overlay | Results in an absolutely positioned Base UI Popover; the list does not move | Tomasz's answer; Popover holds a select and buttons per row | Frame + Research |
| Watchlist | Merged into `/my-deals` (list below the deals); `/watchlist` → 307 in `decideAccess` via `redirectTo()` | Session-safe redirect in the one place access rules live | Frame + Plan |
| E2E | No RAWG mock; the success path is proven below the browser and by hand | `test-plan.md:605-607`; its trigger is unmet | Plan |
| Priority | Game page first; Phases 1–3 are the minimal mergeable set | Tomasz's answer and phase approval | Frame + Plan |

## Scope

**In scope:**
- The catalogue lookup and the provider-neutral cache.
- The `deals_for_game` migration and its truth tables.
- `/games/[id]` with the watch control.
- The search on `/` with an overlay and guest states.
- The list merged into `/my-deals` and the `/watchlist` redirect.
- RAWG images, and the RAWG credit in a shared footer.
- Documents: CLAUDE.md, infrastructure.md, test-plan.md, roadmap S-05.

**Out of scope:**
- A WAF or bot rules, a RAWG mock in E2E, a sitemap, a sign-in return parameter.
- Images or links on deal cards.
- Matching on alternative names, a platform filter on the game page, an index on `deals`.
- `cacheComponents` and Vercel image optimisation.

## Architecture / Approach

- **Data path.** A Server Component page reads the game through `getCatalogGame(id)`: React `cache()` around `unstable_cache` around the provider's `GameCatalog`. Failures are thrown inside the cache, so they are never stored, and returned outside it.
- **Deals.** It reads the deals through `client.rpc("deals_for_game", { name }, { get: true })`, chained with the same listed predicate, order and paging as `/`.
- **Database.** The function runs as the caller under RLS. Its key comes from a definer helper in schema `private`, which neither PostgREST nor pg_graphql exposes.
- **Search and watch.** The search stays URL-driven. Its results render server-side into a client Popover that sits beside the form. Watching posts the existing Server Actions, now in a route-neutral module.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Catalogue lookup and cache | `getGame`, provider-neutral cached search and lookup | A failure or the key leaking into the cache or its log |
| 2. Public match path | `deals_for_game` + `private.game_key`, truth tables, harness line | Grants drifting from the matrix; `private` ever exposed |
| 3. Game page | `/games/[id]` with deals, watch control, 404, footer credit | A soft 404 if anything streams before `notFound()` |
| 4. Search on `/` | Overlay search for everyone, guest sign-in links, shared URL | Overlay submit bubbling into `<Form>`; layout shift |
| 5. Merge into `/my-deals` | List under the deals, `/watchlist` redirect, E2E main flow moved | Breaking the deploy-gating E2E |
| 6. Images | 420/640 RAWG images, placeholder | Undocumented resize paths changing |

**Prerequisites:**
- The local Supabase stack, and a RAWG key in `.env.local` for the manual checks.
- Tomasz runs the hosted `db:push`, `db:check` and the SQL-editor reruns before the first PR or the merge, whichever comes first.

**Estimated effort:** ~4–6 sessions across 6 phases. Phases 1–3 are the minimal set to merge before 2026-11-04.

## Open Risks & Assumptions

- RAWG's resize paths are undocumented (420 and 640 verified, 500 not served). If they change, images fall back to the placeholder until `rawg.ts` changes.
- Without a WAF, a script with unique queries or ids can still spend the quota. It is accepted and recorded, with the trigger to add a Vercel rate-limit rule.
- The real 404 status depends on `notFound()` running before streaming, which `curl -I` must confirm.
- The hosted project can create schema `private`. Supabase's own guides use one; this is confirmed at `db:push`.

## Success Criteria (Summary)

- A guest opens a game's page from a search on `/` and sees exactly the deals that watching that game would put in `/my-deals`.
- A signed-in user watches from the results or the game page, and manages the list in `/my-deals`. `/watchlist` lands there.
- RAWG answers are cached by provider: a RAWG outage leaves pages seen before working, and nothing failed is stored.
