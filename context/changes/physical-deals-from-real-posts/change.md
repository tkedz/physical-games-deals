---
change_id: physical-deals-from-real-posts
title: Physical deals from real posts
status: implementing
created: 2026-09-28
updated: 2026-09-30
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-29, Phase 1, before any live call: Tomasz dropped `qwen/qwen3.8-27b:free` from the evaluation, because credits have to be bought anyway. The evaluation runs the two paid candidates only. With no free model in play, the free-model training setting is never switched on (steps 1.4 and 1.9), and the free-route choice in `evaluation.md` does not arise.
- 2026-09-29, public catalogue: `openai/gpt-4.1-nano`'s two Azure endpoints list `max_completion_tokens` but not `max_tokens`, and no Mistral Small endpoint lists `max_completion_tokens`. The request sends `max_tokens`, which keeps all four Mistral endpoints and nano's OpenAI endpoint under `require_parameters`. It sends no `seed`, which Venice lacks.
- 2026-09-30, Phase 2: each new table's migration revokes from `service_role` as well as `anon, authenticated`, then grants back exactly the planned privileges. The plan's SQL revoked from `anon, authenticated` only. But until 2026-10-30, existing projects still grant every new `public` table to all three roles automatically (Supabase docs, "Securing your API", Default privileges). `service_role` would have kept select, insert, update and delete on all three tables, and check 2.6 ("exactly the planned privileges") could not hold.
