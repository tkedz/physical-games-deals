# Game catalogue provider proven — Plan Brief

> Full plan: `context/changes/game-catalog-provider-proven/plan.md`

## What & Why

The product only lets a collector watch games that exist in an external catalogue, so the catalogue's coverage caps how useful the product can be (PRD open question 7). This change proves the chosen catalogue, RAWG, against Tomasz's own titles and real deal titles, and leaves a thin search contract that S-03 (watchlist) and S-01 (deal extraction) will build on. The answer is recorded either way.

## Starting Point

No code talks to a catalogue. `.env.example` still carries an undecided `IGDB_*` placeholder. RAWG's OpenAPI spec covers every field the next slices need (search, stable id, release year, per-game platforms, editions), but it does not declare the key, documents no failures beyond `200`, has no localisation field, and RAWG folds Switch 2 into Nintendo Switch.

## Desired End State

`npm run catalog:probe` prints, for each agreed title, where RAWG ranks the intended game, and ends with a verdict. `coverage.md` records that verdict against a predicate fixed before the run, together with the constraints S-01, S-03 and S-04 inherit. `src/lib/catalog/` holds a provider-neutral contract with a RAWG implementation that Next server code and Node scripts can both import.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Provider | RAWG | The simpler integration for a course project, chosen after a desk comparison with IGDB. | User, 2026-09-26 |
| How providers were compared | Desk research only | Tomasz declined to register with both services just to compare them. | User |
| Probe set | 10–15 own titles (incl. Polish-named and 1–2 Polish-only) plus ~10 post titles | The verdict answers S-03's question; post titles give S-01 early signal without gating. | User |
| Pass predicate | Found = intended entry in the top 5 for the Polish or English name; PASS when every title on Tomasz's list with an international release is found; Polish-only misses are recorded, post titles never gate | Matches S-03's short result list and the PRD's accepted cost for Polish-only releases (`prd.md:98`). | User |
| Switch 2 | Not a failure criterion; Switch and Switch 2 may merge into one platform | RAWG has no Switch 2 platform; Tomasz accepts merging; S-03 decides the platform list. | User |
| Alternative titles | Out of scope | S-01's extraction may produce them. | User |
| Contract | `GameCatalog.searchGames` returning a result union with four failure reasons | Gives S-03 concrete material for PRD question 6. | Plan |
| Code location | `src/lib/catalog/`, shared by Next and Node; only `import type` between its files | Verified on Node 24.21.0: an inline type specifier fails with `ERR_MODULE_NOT_FOUND`. | Plan |
| Key scope | `.env.local` only; Vercel in S-03, Actions in S-01 | Each consumer wires its own environment. | Plan |
| Record | `coverage.md` plus roadmap answers; PRD untouched | Question 8 was answered in the roadmap the same way. | Plan |

## Scope

**In scope:**

- Provider-neutral contract and RAWG adapter in `src/lib/catalog/`
- Probe (`scripts/catalog/`) with pure ranking/verdict logic and an `npm run catalog:probe` script
- `.env.example`, `CLAUDE.md` facts, roadmap answers, the deployment guide's stale `IGDB_*`
- `coverage.md` with the verdict and the handoff to S-01, S-03, S-04

**Out of scope:**

- An IGDB adapter (only as a follow-up if the verdict fails)
- Any page, footer or attribution link; any database schema
- Vercel or GitHub Actions secrets; a platform vocabulary; alternative titles
- Caching, retries or throttling in the client; edits to the PRD

## Architecture / Approach

`types.ts` holds the contract and nothing else, so Node never resolves it. `rawg.ts` is the only file that knows RAWG: pure URL/response/status functions plus one factory with `fetch` injected. It never logs or returns the request URL, because the key rides in it. The probe splits like the collector: `coverage.mts` normalises titles, ranks results and decides the verdict; `probe.mts` reads the key and titles, queries RAWG one request at a time in two modes (with and without editions), and prints a Markdown report.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Catalogue client and probe | Contract, adapter, probe and config; a smoke run on Silent Hill 2 | RAWG registration may fail (reported in 2024 and 2025); the change then ends with a negative record |
| 2. Coverage verdict and handoff | Full probe run, `coverage.md` with verdict and handoff, roadmap answers | Automatic prefix matching can mis-hit; Tomasz confirms every rank |

**Prerequisites:** a RAWG account and key (Tomasz); access to the Supabase SQL editor to copy ~10 post titles (Tomasz).
**Estimated effort:** about one evening: Phase 1 ~2 hours, Phase 2 ~1 hour including collecting titles.

## Open Risks & Assumptions

- RAWG's maintenance record is poor; obtaining a key is the first check, not a formality.
- Whether RAWG's search matches alternative names is unknown until the run; English names keep the predicate satisfiable.
- The free tier (20,000 requests a month) is assumed to cover S-01 at ~100 posts a day; S-01 re-checks this.
- Switch/Switch 2 merging means a Switch-only owner may see Switch 2 offers; S-03 owns that call.

## Success Criteria (Summary)

- Tomasz runs one command and sees whether RAWG finds the games on his own list.
- `coverage.md` holds a verdict under a predicate agreed before the run, and the roadmap's question 7 is answered.
- S-03 and S-01 start from a stable, key-safe contract and written handoff constraints.
