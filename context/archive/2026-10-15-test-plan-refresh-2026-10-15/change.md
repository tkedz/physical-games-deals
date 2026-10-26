---
change_id: test-plan-refresh-2026-10-15
title: Refresh test-plan.md after Phases 1, 2, 5 and the local Supabase stack
status: archived
created: 2026-10-15
updated: 2026-10-26
archived_at: 2026-10-26T12:50:49Z
---

## Notes

Open a change folder for a refresh of context/foundation/test-plan.md: test-plan-refresh-2026-10-15.

Why: §1–§5, §7 and §8 date from 2026-10-12/13. Since then rollout Phases 1, 2 and 5 shipped,
the local Supabase stack landed (local-supabase-stack), and CI gained an e2e job. This refresh
brings the guide back in line with the repository. Scope: context/foundation/test-plan.md only;
no tests, no code.

Discovery, 2026-10-15
- Sources: test-plan.md; prd.md and roadmap.md (unchanged since 2026-10-12); infrastructure.md
  (changed 2026-10-14); test-stack.md; CLAUDE.md; lessons.md; the change folders of Phases 1, 2, 5
  and local-supabase-stack; vitest.config.mts; playwright.config.ts; ci.yml; collect.yml; next.config.ts.
- Test base: meaningful. Vitest and Playwright are configured, with 25 test files (unit 15, db 7,
  hooks 1, e2e 3). No unit tests cover auth, the collector or the catalogue.
- Hot-spots, same scope as in §1:
  - 30 days: 59 commits (.github/workflows 16, supabase/migrations 12, scripts/extract 11,
    src/lib/deals 6, src/lib/auth 5, src/lib/watchlist 5, supabase/checks 5);
  - 14 days: 31 commits (scripts/extract 10, supabase/migrations 9, .github/workflows 8);
  - since 2026-10-13: 10 commits.

Interview, 2026-10-15
- Q1, worries most: unchanged.
- Q2, burned before: unchanged. There has been no incident.
- Q3, changed without confidence: changed. The new tests calmed him, so the SQL matching rule and
  the extraction prompt are no longer changed without confidence.
- Q4, under-tested (asked for the first time): nothing in particular.
- Q5, do not spend on: unchanged.

§1 and §2 (DIRECTION from Tomasz, 2026-10-15: update both as below, keeping every Impact and
Likelihood rating)
- §1: append the 2026-10-15 interview and hot-spot counts; keep the 2026-10-12 record.
- §2: keep every Impact and Likelihood rating, because the rubric still gives the same values.
  Update only the Source and Risk Response Guidance cells:
  - #2:
    - The eval now fails on a breach. Its record carries the prompt and labels fingerprints, and a
      mismatch fails npm test and stops the extractor.
    - Hiding an expired deal is decided: the database's listing predicate does it. An unreadable
      stated date stays undated, by decision.
    - New evidence: the baseline accepted a known model error. Mistral reads "do niedzieli" in a
      post of Wednesday 2026-10-21 as Monday 2026-10-26, the DST weekend, so such a deal stays
      listed a day too long.
    - Must challenge: "a green eval means expiry is right". The baseline accepts recorded model
      errors and can only shrink.
  - #3:
    - New stall path: a change to the prompt, schema, model list or labels pushed to main without a
      new eval record makes the cron's extract step refuse to run. It refuses before it reads a
      credential and writes no run record, so only the freshness line shows it.
    - collect.yml runs from main without waiting for CI.
    - From 2026-10-30, a new table without explicit grants fails at write time (42501).
    - Must challenge: "a red verify stops a bad pipeline change". It stops the deploy only.
  - #4:
    - The PGlite harness models Supabase's default privileges on both sides of 2026-10-30, keyed on
      the migration's version. The hosted project keys on when the table is created.
    - Functions stay executable by PUBLIC unless revoked, and per the local-supabase-stack research
      sequences carry no explicit grants.
    - Must challenge: "the harness's cut-off is production's".
  - #5: whether another aggregator's or a lookalike site's link counts as a shop is decided: no
    allow-list and no lookalike detection (2026-10-13).
  - #6:
    - The browser round trip shipped with Phase 5: the guest redirect and server-side sign-out
      revocation now gate deploy.
    - The getClaims switch (infrastructure.md) is still pending and would touch the session path.
  - #7: the server under the e2e test runs with a blank RAWG key, so the browser sees the
    "catalogue unavailable" path. The unit layer is still Phase 3's job.

§3: Phases 3 and 4 stay not started, in the current order. Their goals change to account for what
Phase 5 already proves.
- Phase 3:
  - The e2e test exercises the catalogue-unavailable path, and the pipeline's grants are proven in
    the db harness.
  - The build-output scan must scan the deploy job's build. The e2e build has a blank RAWG key and
    the local NEXT_PUBLIC_* values.
- Phase 4:
  - The guest redirects and server-side sign-out revocation are covered by e2e.
  - What remains is isolation per role (anon, user A, user B, the pipeline role), plus the access
    decision, session refresh and caching below the browser.
  - The local stack (PostgreSQL 17 with GoTrue and PostgREST) is a candidate for Data API isolation
    checks beside PGlite. Per the local-supabase-stack research, it is not a grants oracle while
    CLI 2.117.0 auto-grants. Phase 4 research decides.

§4: rewrite the stale rows.
- Database: PGlite 0.5.9, chosen in Phase 1. The local stack exists.
- Boundary stubs: still none. accounts.test.ts stubs fetch, and the e2e server's RAWG key is blank.
- Eval: 55 real and 8 synthetic posts, two runs each; the posts can be re-exported with
  export-posts.sql.
- Post-edit hook: three hooks are wired. They miss edits made through Bash or by hand.
- e2e: Playwright 1.64.1, three tests, the CI e2e job, and playwright-cli for exploration.
- The grounding note.
- The constraints paragraph:
  - dev and E2E run on the local stack;
  - previews and npm run dev:hosted reach production;
  - next build and next start are unguarded;
  - agents ask before npm run local:reset.
- Add "Test base at refresh: meaningful".

§5: update the gates.
- typecheck: also runs in the e2e job's next build (beside verify, before deploy) and in the local
  end-of-turn hook. It has still never been proven red.
- npm test: drop "pipeline and access" until Phases 3 and 4 ship.
- Migration-only pushes: they skip e2e, and local:up applies the migration before the push.
- eval: wired. npm test fails on a fingerprint mismatch, and the extract step refuses to run.
- post-edit hook: wired, local, not a gate.
- build-output scan: on the deploy build.
- e2e: wired. The e2e job runs on seed data in a local stack, deploy needs it, and it has been
  proven red. It is not a required check.

§7: add the exclusions decided since 2026-10-12, each with its source.
- testing-matching-rule-protection plan: the acceptance sample's four misses; no normalisation
  beyond NFC.
- testing-extraction-and-listing-guard plan: no real posts in the labelled set; no lookalike
  detection or shop allow-list; no test of the page query's .or() filter.
- testing-main-flow-end-to-end plan: no E2E against the hosted project; no catalogue path or RAWG
  mock in E2E; no E2E on pushes touching only supabase/**.

§8: set all three dates to the refresh date. Note two dated events before the 2026-11-04 deadline:
the DST change on 2026-10-25 and Supabase's default-privileges change on 2026-10-30.

Challenger findings (left out of §2)
- "Local work reaches production" (unguarded next build/start, a reused dev:hosted server, previews
  signing up in production): the target guards are unit-tested. The rest are deliberate
  infrastructure choices that infrastructure.md tracks, not regressions a test can catch.
- "A local extract re-bills posts": a developer action with a small cost, documented in CLAUDE.md.
  It is not a product failure.

Outside this refresh (noted, not changed)
- infrastructure.md's Operational Story still says verify runs lint and format only.
- watchlist-from-catalog F8, which called previews writing to production "harmless", was skipped.
- The DST misread fix is a prompt change and needs its own eval run.

Stack grounding tools (current session, checked 2026-10-15)
- Docs: Context7 is available. It was not re-queried, because the 2026-10-12 checks are three days
  old. The Playwright 1.64.1 and Supabase CLI 2.117.0 facts were read from the installed packages.
- Search: WebSearch is available but was not used. Exa.ai is not available.
- Runtime/browser: Chrome DevTools MCP and the playwright-cli skill are available. Playwright MCP
  is not.
- Provider/platform: no GitHub, Supabase or Vercel MCP.

After creating the folder, follow the downstream continuation rule.

### 2026-10-15 — Phase 1

- **The labelled set's listable deals are 34, not 23.** §2 #2's guidance said "the 23 listable deals of the labelled set cannot measure a share (one error is 4.3%)". The 8 synthetic posts added 11 listable deals (game, physical, priced), so the cell now reads 34 (23 real, 11 synthetic) and 2.9%, and adds that they are not a random sample. The plan did not name this cell; it is the same staleness as correction 9. Counted with a script over `labels.json`, using the rule that reproduces the old 23.
- **§7's intro says where the re-evaluate conditions come from.** The plan derives them at refresh time; one added sentence says so in the guide, so a reader does not take them for the phase plans' own.
