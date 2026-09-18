---
bootstrapped_at: 2026-09-17T00:00:00Z
starter_id: next
starter_name: Next.js
project_name: physical-games-deals
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Source: `context/foundation/tech-stack.md`, read in full at run start.

```yaml
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
```

### Why this stack (verbatim from hand-off body)

A solo builder working after hours against a hard 2026-11-04 deadline chose Next.js over the recommended default for `(web, js)` after seeing the full candidate set. Next clears all four agent-friendly gates, its scaffolding is verified, and it carries the largest body of React training data — load-bearing with no second pair of eyes. Next ships no auth or database of its own, so Supabase supplies both: its row-level security enforces at the database layer the guardrail that one user's watchlist never leaks to another, and its Postgres accepts a connection string from GitHub Actions. That matters because collection already runs as a four-hourly Actions cron that will move into this repository and write to the database; running on a runner rather than in a request, it is unconstrained by Vercel's serverless shape. Auth, AI and background-job flags are all set — extracting deals from free-form human-written posts is LLM work. Payments and realtime are false per the PRD's non-goals. The self-check flagged one gap — no prior Next.js experience — so App Router conventions are worth pinning in the project instruction file. Supabase is not machine-readable in this hand-off; state it when running the bootstrapper.

### Operator-supplied context at confirm time

The user supplied two facts at the hand-off confirmation step that the frontmatter cannot carry. Recorded here for the audit trail; bootstrapper took no action on either in v1.

- **Supabase supplies auth and Postgres.** Not installed by the Next.js scaffold — the starter CLI ships neither. Follow-up work.
- **The GitHub Actions collector moves into this repository** and writes to that same Supabase Postgres. No CI workflow files are generated in v1.

## Pre-scaffold verification

| Signal      | Value                                                    | Severity | Notes                                                                                               |
| ----------- | -------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| npm package | `create-next-app` v16.3.5 published 2026-09-16T23:45:59Z | fresh    | resolved from `cmd_template` (`npx create-next-app@latest …`)                                        |
| GitHub repo | not run                                                  | n/a      | card `docs_url` is `https://nextjs.org/docs` — not a GitHub URL, so no `pushed_at` signal available  |

Published one day before this run. No staleness warning raised.

## Scaffold log

**Resolved invocation**: `npx create-next-app@latest bootstrap-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 15
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (absent in cwd before the run)
**temp scaffold dir cleanup**: deleted

### Deviation from the documented temp-directory name

The first attempt used the skill's documented temp directory `.bootstrap-scaffold` and failed:

```
Could not create a project called ".bootstrap-scaffold" because of npm naming restrictions:
    * name cannot start with a period
EXIT_CODE=1
```

`create-next-app` validates the target directory name as an npm package name, which forbids a leading period. The CLI refused before creating anything, so the working directory was untouched. The run was retried with the dot-less name `bootstrap-scaffold`; all other semantics of the strategy (conflict matrix, `context/` preservation, `.gitignore` merge, temp-dir deletion) were unchanged. This is a skill-side incompatibility, not a user-addressable failure — hard-stopping would have left no path forward.

### Files moved up into cwd

`.git`, `.gitignore`, `.next`, `AGENTS.md`, `README.md`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.ts`, `node_modules`, `package-lock.json`, `package.json`, `postcss.config.mjs`, `public`, `src`, `tsconfig.json`

**Dropped under the `context/` rule**: none — the scaffold produced no `context/` tree. The existing `context/` (`foundation/`, `changes/`, `archive/`, `README.md`) is intact and unmodified.

### Two side effects worth noting

- **`.git` moved up.** `create-next-app` ran `git init` inside the temp directory and left one scaffold commit. Under the conflict matrix that directory moved up like any other non-conflicting path, so this project is now a git repository whose sole commit contains the scaffold files. The bootstrapper did not initialise it. If a different history is wanted, `rm -rf .git && git init` starts clean.
- **`AGENTS.md` was written by the CLI**, not by the bootstrapper. `create-next-app` v16 defaults to `--agents-md`. No `AGENTS.md` existed in cwd, so it moved silently. v1 of this skill does not generate agent-context files; this one is the starter's.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: no findings to split. Dependency tree: 438 total (17 prod, 384 dev, 88 optional).
**Audit tool exit code**: 0

Raw output:

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": {
    "vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 },
    "dependencies": { "prod": 17, "dev": 384, "optional": 88, "peer": 0, "peerOptional": 0, "total": 438 }
  }
}
```

Clean tree at scaffold time. One deprecation notice surfaced during install (`eslint@9.39.5` is no longer supported upstream) — a maintenance signal, not a vulnerability, and `npm audit` does not count it.

#### CRITICAL findings

none

#### HIGH findings

none

#### MODERATE findings

none

#### LOW / INFO findings

none

## Hints recorded but not acted on

| Hint                                                             | Value                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| bootstrapper_confidence                                          | verified                                                                                               |
| quality_override                                                 | false                                                                                                  |
| path_taken                                                       | custom                                                                                                 |
| self_check_answers                                               | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: false |
| team_size                                                        | solo                                                                                                   |
| deployment_target                                                | vercel                                                                                                 |
| ci_provider                                                      | github-actions                                                                                         |
| ci_default_flow                                                  | auto-deploy-on-merge                                                                                   |
| has_auth                                                         | true                                                                                                   |
| has_payments                                                     | false                                                                                                  |
| has_realtime                                                     | false                                                                                                  |
| has_ai                                                           | true                                                                                                   |
| has_background_jobs                                              | true                                                                                                   |
| (operator-supplied) Supabase for auth + Postgres                 | recorded; not installed by the scaffold                                                                |
| (operator-supplied) GitHub Actions collector moves into this repo | recorded; no CI workflow files generated in v1                                                        |

`self_check_answers.can_judge_agent: false` and the hand-off body flag the same gap — no prior Next.js experience. v1 surfaces it; it does not compensate. Pinning App Router conventions in the project instruction file is the follow-up the hand-off itself recommends.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- Decide what to do about the `.git` that came up with the scaffold — keep its single scaffold commit, or `rm -rf .git && git init` for a clean history.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` (`diff CLAUDE.md CLAUDE.md.scaffold`) and decide which content to keep. Your `CLAUDE.md` is the bootstrap-chain instruction file; the `.scaffold` sibling is the starter's.
- Add Supabase (auth + Postgres) — named in the hand-off rationale but not installed by the Next.js scaffold.
- Move the four-hourly GitHub Actions collector into this repository and point it at the Supabase connection string.
- Address audit findings per your project's risk tolerance — this run found none.
