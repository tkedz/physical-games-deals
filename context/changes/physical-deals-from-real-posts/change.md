---
change_id: physical-deals-from-real-posts
title: Physical deals from real posts
status: implementing
created: 2026-09-28
updated: 2026-10-05
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-29, Phase 1, before any live call: Tomasz dropped `qwen/qwen3.8-27b:free` from the evaluation, because credits have to be bought anyway. The evaluation runs the two paid candidates only. With no free model in play, the free-model training setting is never switched on (steps 1.4 and 1.9), and the free-route choice in `evaluation.md` does not arise.
- 2026-09-29, public catalogue: `openai/gpt-4.1-nano`'s two Azure endpoints list `max_completion_tokens` but not `max_tokens`, and no Mistral Small endpoint lists `max_completion_tokens`. The request sends `max_tokens`, which keeps all four Mistral endpoints and nano's OpenAI endpoint under `require_parameters`. It sends no `seed`, which Venice lacks.
- 2026-09-30, Phase 2: each new table's migration revokes from `service_role` as well as `anon, authenticated`, then grants back exactly the planned privileges. The plan's SQL revoked from `anon, authenticated` only. But until 2026-10-30, existing projects still grant every new `public` table to all three roles automatically (Supabase docs, "Securing your API", Default privileges). `service_role` would have kept select, insert, update and delete on all three tables, and check 2.6 ("exactly the planned privileges") could not hold.
- 2026-10-05, Phase 3 lands in two commits. The first carries the code, after the local proving runs (3.1–3.4). It has to come first because the `workflow_dispatch` run (3.5) and the scheduled runs read `collect.yml` from `main`. `review.md` and the answers in the PRD and the roadmap (3.9–3.10) follow in a second commit, after the backlog run and the sample review.
- 2026-10-05, Phase 3, change 6, decided by Tomasz before the push: extraction gets a pause and an optional cut-off, both steered by GitHub repository variables, without a deploy. `EXTRACT_PAUSED=true` skips the extract step. `EXTRACT_SINCE` limits runs to posts first seen since a chosen moment. Neither variable is set for now, so the backlog is processed as planned, for about $0.45. If spending runs above expectations, setting `EXTRACT_SINCE` leaves the rest of the backlog unprocessed until Tomasz decides otherwise. No migration is needed: `pipeline_runs.links_pending` keeps counting every pending link, as its column comment says. Recorded as change 6 and steps 3.11–3.13.
