# Physical Deals from Real Posts — Plan Brief

> Full plan: `context/changes/physical-deals-from-real-posts/plan.md`
> Research: `context/changes/physical-deals-from-real-posts/research.md`

## What & Why

S-01 is the roadmap's north star: the smallest slice that tests whether freehand Polish deal posts can be read automatically with digital editions kept out. It adds a model-driven extraction step to the existing collection cron. It also replaces the placeholder at `/` with a public list of boxed-edition deals, each with a price and a link to where it came from.

## Starting Point

About 2,000 collected posts (1,573 distinct links) sit in `public.collected_posts`, unprocessed, and the collector keeps adding more every four hours on GitHub Actions. Every table is locked, Vercel holds only the publishable key, `/` is a "W budowie" placeholder, and there is no model account yet.

## Desired End State

Every collection run also extracts: new posts first, one model call per link. `/` lists physical, priced game deals, newest first. Each shows its platform, any stated discount and expiry, and a shop or source link. A line says when the data was last refreshed, with a note once that is more than six hours ago. A digital or unpriced item cannot reach the page even through a faulty query, because the database's read policy admits only listable rows.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Model route | Buy $10 of credits once. Run `mistral-small-3.2-24b-instruct`, with `gpt-4.1-nano` as fallback. A free model goes in only if it ranks first and Tomasz picks that route | Paid costs about $1 a month here, so a free model has to win on quality, not price | Research → Plan |
| Checking the model | About 50 labelled real posts, before any pipeline work, run on three candidates: the two paid ones and `qwen3.8-27b:free`, with the training setting on for the test only. Every model in the list needs zero digital leaks | The physical/digital judgement is the one unknown, a reasoning model may catch the traps better, and the set stays as a regression check | Plan |
| Quality threshold | A random 100-link review after the backlog run. Tomasz sets the threshold for PRD question 3 from it, and the page waits for that | The PRD defers the number to the first real results | PRD → Plan |
| Catalogue ids | None in S-01: the model stores the original English title and any alternative titles, and S-04 resolves or matches them | Keeps S-01 on its one unknown, and puts the pick rule next to S-04's matching | Plan (changes roadmap wording) |
| Retries | An attempt counter per post; give up after three counted failures. Outages never count, and failures count only in a run with at least one success | Tells never-attempted posts from failing ones, with no "caught up" condition to compute | Plan (replaces F-02's age rule) |
| "Last refreshed" | The last run where collection succeeded and extraction hit no systemic failure; a stale note after 6 h | Separates "no deals" from "broken processing" (US-01) | Plan |
| What is listed | A game, a physical copy, and a stated price; `unclear` stays hidden. The RLS policy states the same rule | A false hit costs more than a miss (PRD guardrail) | PRD |
| Links | A shop URL only if it appears verbatim in the post; the source post is always linked | The link must lead to the deal's origin | PRD |
| Expiry | Shown through the end of the stated day, Warsaw time | "przestaje być pokazywana po tej dacie" | PRD |
| Duplicates | One call per link; the same offer on two aggregators stays two cards | PRD question 2 defers merging across sources | Research + PRD |
| Access and grants | `deals` and `pipeline_runs` are readable through select policies, the raw output is locked, and `service_role` gets explicit grants | The page reads with the publishable key, and Supabase stops auto-granting on 2026-10-30 | Plan (verified) |
| Where it runs | A step after collection in `collect.yml`, newest first, with an ~8-minute budget | Keeps the six-hour freshness requirement | Inherited (infrastructure.md) |

## Scope

**In scope:**
- The schema, prompt, OpenRouter client and pure decisions, with the labelled-set evaluation (`evaluation.md`).
- Four additive migrations.
- The extraction step in `collect.yml`, and a review report feeding `review.md` with the answers to PRD questions 2 and 3.
- The public view at `/`, with kitchen-sink states and a screenshot gate.
- Updates to `.env.example`, `CLAUDE.md` and the roadmap.

**Out of scope:**
- RAWG ids and watchlist matching (both S-04).
- Merging deals across aggregators.
- A free model in production, unless it wins the evaluation; the Batch API and SDKs.
- A template-based second path, and fetching full articles.
- Automatic re-extraction, alerting and indexes.

## Architecture / Approach

The extract step runs after the collect step in the same job:

1. It takes pending rows (`processed_at is null and extraction_attempts < 3`), newest first, grouped by link.
2. It calls OpenRouter with the `models` list and a strict JSON schema built from zod.
3. Pure decisions validate the reply and verify the shop link. They also compute the expiry instant and decide what is listable.
4. It writes `post_extractions` (locked) and `deals` (public, filtered by policy), then closes the rows.

Each workflow run writes one `pipeline_runs` row. On `/`, a Server Component reads with the publishable key and streams a page of listed, unexpired deals plus the last `ok` run, under a skeleton.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Extraction contract and labelled-set evaluation | The schema, prompt, client and decisions; `evaluation.md` with the chosen model list | No model reaches zero digital leaks; the work stops for a decision with Tomasz |
| 2. Tables for deals, extractions and runs | Four migrations, with `db:check` green | A missing grant surfaces only at write time, as `42501` |
| 3. Extraction on the cron, backlog run and sample review | The pipeline live, the backlog drained, `review.md`, and PRD questions 2 and 3 answered | The error share on the real mix exceeds Tomasz's threshold, so Phase 4 waits |
| 4. Public deals view | `/` with pagination, freshness, and loading, empty and error states; screenshots; a production check | Layout at 375 px, and the freshness copy |

**Prerequisites:**
- An OpenRouter account with $10 of credits, a key with a credit limit, and the free-model training setting on for the evaluation (Tomasz).
- The Supabase CLI linked for `db:push` (Tomasz).
- The F-02 collector running.

**Estimated effort:**
- About 4–6 sessions across the 4 phases.
- About two days of scheduled runs to drain the backlog.
- About an hour of Tomasz's time for labelling and the review.

## Open Risks & Assumptions

- **Accuracy:** unmeasured until Phase 1. lowcygier bodies are short excerpts, so its edition judgement may be the weakest; the review measures it per aggregator.
- **Request shape:** the `$schema` key and integer bounds are untested on the endpoints. Phase 1's first live call settles it.
- **Rate limits:** unmeasured for paid models. A 429 stops the run without spending attempts.
- **The free candidate:**
  - It has one provider and a cap of 20 requests a minute.
  - Its reasoning may not switch off.
  - If it wins and Tomasz picks it, the extractor calls the models in order itself, and each run handles about 160 links.
- **Expiry:** credits may expire 365 days after purchase, and model ids can expire; the fallback absorbs an expired id.
- **Schedule:** GitHub's schedule delays eat into the roughly two-hour margin against the six-hour requirement.

## Success Criteria (Summary)

- A visitor opens `/` and sees boxed-edition deals read from real posts, with prices and working links, and no digital editions.
- The page says when the data was last refreshed, and flags it when processing has stopped.
- The model choice and the first run's quality are on record, and PRD questions 2 and 3 are answered from them.
