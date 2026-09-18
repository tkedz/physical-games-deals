---
starter_id: next
package_manager: npm
project_name: physical-games-deals
hints:
  language_family: js
  team_size: solo
  deployment_target: vercel
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
---

## Why this stack

A solo builder working after hours against a hard 2026-11-04 deadline chose Next.js over the recommended default for `(web, js)` after seeing the full candidate set. Next clears all four agent-friendly gates, its scaffolding is verified, and it carries the largest body of React training data — load-bearing with no second pair of eyes. Next ships no auth or database of its own, so Supabase supplies both: its row-level security enforces at the database layer the guardrail that one user's watchlist never leaks to another, and its Postgres accepts a connection string from GitHub Actions. That matters because collection already runs as a four-hourly Actions cron that will move into this repository and write to the database; running on a runner rather than in a request, it is unconstrained by Vercel's serverless shape. Auth, AI and background-job flags are all set — extracting deals from free-form human-written posts is LLM work. Payments and realtime are false per the PRD's non-goals. The self-check flagged one gap — no prior Next.js experience — so App Router conventions are worth pinning in the project instruction file. Supabase is not machine-readable in this hand-off; state it when running the bootstrapper.
