# Watchlist from the Catalogue — Plan Brief

> Full plan: `context/changes/watchlist-from-catalog/plan.md`

## What & Why

Roadmap slice S-03 gives a signed-in collector a private watchlist. They search the RAWG catalogue as they type and add a game, or a phrase, with an optional platform. They can see the list and remove entries. The list is the second half of the product's central claim: S-04 will narrow the deals to it. Two answers Tomasz gave on 2026-10-06 unblock and reshape the slice. A catalogue failure shows one generic message (PRD question 6), and phrases join catalogue games (roadmap question 9). The second reverses the PRD ruling that only catalogued games may be watched.

## Starting Point

Every path is public (`src/lib/auth/access.ts`), no table belongs to a user, no migration uses `auth.uid()`, and the app has no Server Actions. The RAWG client from F-03 exists, but no app code calls it and Vercel does not hold its key. Deals carry a closed platform vocabulary (`ps5`, `ps4`, `xbox-series`, `xbox-one`, `switch`, `switch-2`, `pc`, `other`) and titles rather than catalogue ids.

## Desired End State

A signed-in user opens `/watchlist` from a header link, types a title and, after a pause, watches a catalogue game for one platform or any platform, or watches the typed text as a phrase. Their list shows newest first; a removed entry disappears from the view while its record stays. Guests are sent to `/login`, no other user can read or change the list, and when RAWG fails a generic message appears while the list keeps working. The PRD, the roadmap, CLAUDE.md and the deployment docs say so, and the demo account holds a prepared watchlist.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Catalogue failure (PRD Q6) | One generic "chwilowo niedostępny" message for all four failure reasons; the log keeps the reason and status, never the URL | Tomasz, 2026-10-06; the user cannot act on the reason, and the operator still sees it |
| Phrases (roadmap Q9) | A second kind of entry beside catalogue games | Tomasz, 2026-10-06; RAWG lags new releases (Fire Emblem: Fortune's Weave), and Phase 1 rewrites PRD:98 |
| What counts as a duplicate | One active entry per game and platform, with "any" as one value; phrases ignore letter case and surrounding spaces | Lets a collector watch a game on exactly two consoles; S-04 joins the entries with "or" |
| Pinnable platforms | The fixed seven from the deals vocabulary, for games and phrases | The pin equals the deal's value, so S-04 compares them directly; RAWG's gaps do not block a choice |
| Adding a phrase | From the search field, under results, under no results and under the outage message | One field covers both paths, the catalogue comes first, and a phrase works while RAWG is down |
| What a phrase matches (for S-04) | Contained in any title of a deal, ignoring letter case and Polish diacritics; 3 or more characters | Predictable, and explained in one sentence of UI copy |
| Search interaction | Live: 300 ms pause, from 3 characters; Enter searches any non-empty query | Tomasz's choice over submit-only search |
| Search mechanics | The URL holds the state; `next/form` GET submits itself; the server renders results in Suspense | The router discards superseded searches, so no client-side race code is needed |
| Writes and isolation | Server Actions; RLS on `(select auth.uid())`; column-level grants; no delete; soft removal through `removed_at` | Vercel has only the publishable key; FR-004 keeps the record |
| Access | `/watchlist` private, guests go to `/login`, no `next` parameter | One private view, one click from the header; no open-redirect surface |
| What a game entry stores | The RAWG id, slug, name and release date at the time of adding | The list renders without RAWG, and S-04 can match by id or by name |
| Small UX calls | `native-select` from the registry; no confirmation on removal; no editing; no images | Works without JS; re-adding is cheap; RAWG images are background art |

## Scope

**In scope:** PRD, roadmap and CLAUDE.md updates; the `public.watchlist_entries` migration with its RLS; a pure rules module; the views and their kitchen sink states; the access rule; the server-only catalogue search; three Server Actions; the page with live search and the header link; `RAWG_API_KEY` on Vercel and the deployment docs; production acceptance, including the demo account's watchlist.

**Out of scope:** deal matching (S-04); return to the requested page after sign-in; editing an entry or restoring a removed one; confirmation or undo for removal; RAWG images; caching or throttling RAWG; pagination; a separate Supabase project for previews; a test runner.

## Architecture / Approach

The flow, step by step:

- **Search.** `/watchlist?q=…&platform=…` is the search state. A client form (`next/form`, GET, `replace`) submits itself after a pause in typing. The page's Server Component calls `searchCatalog`, a `server-only` wrapper around `createRawgCatalog` that turns every failure into one result value. It also reads the user's active entries, cached per render, and renders results inside a Suspense boundary keyed by the search.
- **Writes.** Add and remove buttons post Server Actions through `useActionState`. Each action re-checks the user, validates the input with the pure module's zod schemas, and writes with the request's Supabase client, acting as `authenticated`. On success it calls `refresh()`.
- **Isolation.** Postgres holds the boundary: owner-only policies, `user_id default auth.uid()`, column grants, an update that can only set `removed_at`, and unique partial indexes for active entries.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Decisions on record and the locked table | PRD, roadmap and CLAUDE.md updated; `watchlist_entries` with RLS, proven in SQL as two users and anon | RLS details: removal must stay visible to SELECT, and an identity column inserted by `authenticated` |
| 2. Views in the kitchen sink | Every state of the search and the list, rendered from sample data, screenshotted | The kitchen sink must never reach Supabase or RAWG, because dev uses the production project |
| 3. The private view, end to end | Access rule, catalogue search, queries, actions, live page, header link; accepted in dev | Live-search UX (the input must not reset); the key must never reach a log |
| 4. Production and records | Key on Vercel, docs updated, merge, demo watchlist, isolation and session checks on production | A missing key on Vercel would show the outage message to everyone |

**Prerequisites:**

- S-02 and F-03 are complete in code. Their roadmap rows still read `in-progress` until `/10x-archive`.
- Node 24.
- The Supabase CLI is linked.
- `RAWG_API_KEY` in `.env.local` (since F-03).
- Tomasz is available for `db:push`, the SQL checks, `npm run dev`, Vercel settings and the merge.

**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- **Sequence grant.** An identity column needs no sequence grant for `authenticated`. Phase 1's insert test proves it before any app code exists.
- **Non-ASCII letter case.** `lower(phrase)` follows the database's ctype. Phrases that differ only in non-ASCII case might both be saved, which is harmless.
- **RAWG quota.** Live search plus `refresh()` costs a few RAWG requests per title, against 20,000 a month, with no throttling.
- **Real data from dev and previews.** Dev and previews write real watchlists into the production Supabase project. This is accepted, as in S-02.
- **No effect on `/` until S-04.** Until S-04 ships, the watchlist does not narrow the deals on `/`.
- **The phrase definition binds S-04.** Changing it later may mean revalidating stored phrases.

## Success Criteria (Summary)

- A collector builds and trims their own watchlist of games and phrases, with optional platforms, without leaving `/watchlist`, including while RAWG is down.
- No other account, and no guest, can see or change that list.
- The demo account shows a ready watchlist on production, and the documents match what was built.
