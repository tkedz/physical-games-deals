# Extraction and Listing Guard — Plan Brief

> Full plan: `context/changes/testing-extraction-and-listing-guard/plan.md`
> Research: `context/changes/testing-extraction-and-listing-guard/research.md`

## What & Why

Rollout Phase 2 of the test plan covers Risks #2 and #5:

- a prompt or model change that quietly makes extraction worse;
- a deal that stays listed past its stated end;
- a deal link that leads somewhere other than the deal's origin.

The plan tests every deterministic rule with literal oracles. It turns the extraction eval from a report into a gate that blocks, binding a passing run to exactly what production sends. It also adds a post-edit hook so agent edits run the fast suites at once.

## Starting Point

- **No tests** call the expiry, row-mapping, listability or link rules.
- **The eval:**
  - exits 0 on leaks;
  - measures the candidate models rather than the production one;
  - records nothing that ties a run to the prompt;
  - cannot see sets, expiry or links.
- **The extractor** runs from `main` every 4 h without waiting for CI.
- **Expired deals** are hidden by one filter in the page query, not by the database.
- **The link rule** keeps another aggregator's link and a userinfo URL.

## Desired End State

- **Unit and database tests** guard the expiry instant across both 2026 clock changes, the row mapping, listability, adversarial links at write and render time, and the hide of expired deals for every reader.
- **The eval:**
  - runs twice and exits 1 on a breach;
  - on a pass, writes a committed `result.json` holding per-item outcomes and two sha256 fingerprints.
- **A prompt, model or label change without a matching passing record** fails `npm test` and is refused by the extractor before anything reaches `public.deals`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Hiding expired deals | Expiry term in the `deals` select policy and in `matched_deals`; the query keeps its copy | Covers any reader, and PGlite can test it | Research OQ1 → Plan (user) |
| Unreadable dates | Accept `7:00`; any other unreadable date stays undated (listed) | Dated deals are rare, and hiding would drop valid deals | Research OQ2 → Plan (user) |
| Other aggregators' links | Rejected, as are URLs with userinfo; lookalike hosts stay | PRD: the link leads to the shop or the source post, never another offer | Research OQ3 → Plan (user) |
| Growing the labelled set | ~8 synthetic posts by the agent, reviewed by Tomasz; labels gain expiry-instant, set and link fields | Makes sets, expiry and link choice measurable without hand-labelling real posts | Research OQ4 → Plan (user) |
| Extractor on an unrecorded prompt | Refuses (exit 1) before reading credentials or sending | The only variant that stops a merged prompt reaching production | Research OQ6 → Plan (user) |
| db hook | Background (`asyncRewake`), single-flight; unit synchronous | A series of migration edits does not wait 16 s each | Research OQ7 → Plan (user) |
| Repeats and baseline | 2 runs, each must pass. Per-item failures may only shrink against the last record; a new item is accepted on first sight; with no record, v3 is the baseline | One run varies; "no new failure" is the regression rule | Plan |
| What the fingerprint hashes | The full request body for a fixed synthetic post, plus `PROMPT_VERSION`; labels hashed separately | Covers everything production sends, and comment edits do not count | Plan |

## Scope

**In scope:**
- unit tests for `expiryInstant`, `toDealRows`, `isListable`, `formatExpiry`, `verifyShopUrl` with `postHrefs`, and `dealLinks`;
- fixes for the one-digit hour, aggregator links and userinfo;
- the expiry migration with `supabase/checks/listed-expiry.sql`;
- `fingerprint.mts`, the judge, label fields, synthetic posts, 2 runs, exit 1, `result.json`;
- `MODELS ⊆ CANDIDATES`, `export-posts.sql`, the extractor refusal;
- the post-edit hook;
- test-plan §6.1, §6.3, §6.6 and CLAUDE.md facts.

**Out of scope:**
- real posts in the labelled set;
- gating currency, platform or discount;
- measuring the 5% share on the labelled set;
- lookalike detection or a shop allow-list;
- rewriting stored rows;
- a scheme `CHECK` in the database;
- rendering the card;
- testing the query's `.or()` text;
- the eval in CI;
- §1–§5 of the test plan.

## Architecture / Approach

The deterministic rules are tested where they live: pure functions in `scripts/extract/deals.mts` and `src/lib/deals/`, and SQL in the policy and view. Expected values come from the PRD, the EU DST rule, the table checks and the decisions. The eval gate is a pure judge over per-item outcomes keyed `<postId>#<itemIndex>`, run on two eval runs. One fingerprint module is shared by the eval (writes it), `npm test` (compares it) and `extract.mts` (refuses on a mismatch). It hashes `requestBody(buildMessages(sample))` through the exported OpenRouter body builder.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Post-edit hook | Unit suite after mapped edits, db suite in the background | Windows path handling in hooks; the 10x CLI overwriting settings |
| 2. Write-side listing rules | Literal-instant expiry tables, row mapping, listability; `7:00` fix | Oracles drifting toward the code's output |
| 3. Link rule | Adversarial write and render tables; aggregator and userinfo rejection | Missing a scheme spelling; a new feed host not covered |
| 4. Expired deals in the database | Policy and view term, check file in PGlite and hosted | `create or replace view` dropping `security_invoker` |
| 5. Eval gate logic | Fingerprints, judge, label fields, synthetic posts, exit 1, writer | Baseline rules too strict (flaky fails) or too loose |
| 6. First record and refusal | `result.json`, record test, extractor check in one commit | A refusal landing before the record stops production extraction |
| 7. Cookbook and facts | §6.1, §6.3, §6.6; CLAUDE.md | — |

**Prerequisites:**
- Node 24 active;
- Tomasz available for `db:push`, the hosted SQL runs, two eval runs (≈ $0.12 in total) and the synthetic-post review;
- `posts.json` present locally.

**Estimated effort:** ~4–5 sessions across 7 phases. Phase 5 is the largest.

## Open Risks & Assumptions

- **Flaky gate:** a flaky miss shows up as a gate failure. Two runs and the "shrink only" baseline may need a rerun now and then; §6.3 says how to read the reasons.
- **Bootstrap:** it assumes v3's per-post outcome (#49 missed) still holds for Mistral. If the first real run misses something else, the plan stops for a decision rather than loosening the baseline.
- **Coupling:** a `zod` upgrade that changes the reply schema stops extraction until the eval is rerun. That is intended, but it couples a dependency bump to a paid run.
- **Record integrity:** a hand-edited `result.json` defeats the check. The record is a speed bump, not proof.
- **Hooks:** the exec form and `asyncRewake` behaviour on this Windows setup are taken from the docs (checked: 2026-10-13) and are confirmed by Phase 1's smoke test.

## Success Criteria (Summary)

- A prompt or model change cannot reach `public.deals` without a passing two-run eval recorded in the repository.
- An expired deal is hidden from every reader with the publishable key, and a deal's stored link is the post's own off-site web link or the post itself.
- The test plan's §6.3 lets anyone change the prompt safely without asking.
