# Schema in repo migrations, with row-level security locked by default — Plan Brief

> Full plan: `context/changes/schema-migrations-and-rls-baseline/plan.md`

## What & Why

Roadmap item F-01. The database schema moves into version-controlled Supabase migrations in this repository, and every table added from here on starts with row-level security enabled and no policy, so access has to be granted deliberately rather than remembered. The guardrail this protects — one user's watchlist never visible to another, including by editing the URL — is the one whose failure is silent, and retrofitting row-level security onto tables that already hold data is where that failure happens.

## Starting Point

There is no schema at all: no `supabase/migrations/` directory, no `.sql` file anywhere, no generated database types, and nothing in `src/` that queries the database. The Supabase CLI (2.117.0) is installed as a devDependency but no project is linked. Two documents already describe this state inaccurately — `context/deployment/deploy-plan.md:114` calls the migrations directory "empty" when it does not exist.

## Desired End State

One migration lives in the repository and has been applied to the hosted project, creating `public.collected_posts` — a field-for-field mirror of the RSS collector's record — with row-level security on, zero policies, and no privileges for `anon` or `authenticated`. `npm run db:check` is the named gate, and it has been watched failing against a deliberately unlocked table, so it is a demonstrated control rather than an assumption. The workflow that produced all this is written into `CLAUDE.md`.

## Key Decisions Made

| Decision                 | Choice                                                            | Why (1 sentence)                                                                                                                       | Source   |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Verification environment | Hosted only — no local Docker stack                               | Docker's engine is not running on this machine and the dependency was judged not worth carrying for a thin foundation change.           | Plan     |
| Posture enforcement      | `supabase db advisors --type security --fail-on error`            | First-party, zero-maintenance, and `--fail-on` is the exact analogue of the `--max-warnings 0` rule already in the lessons register.    | Plan     |
| Apply path               | Human runs `npm run db:push`                                      | Matches the recorded human-only boundary for Supabase operations, and adds no write credential to CI.                                   | Plan     |
| Table placement          | `public`, RLS on, zero policies, **plus explicit `revoke`**       | Two independent locks; the `revoke` behaves identically local and hosted, whereas the `config.toml` exposure flag governs only local.   | Plan     |
| Table shape              | Exact 1:1 mirror of the collector's nine JSON fields              | Makes F-02's loader a straight insert with `on conflict (id) do nothing`, reproducing the collector's deduplication exactly.            | Plan     |
| Revert discipline        | Additive-only rule in the runbook, plus a `-- Revert:` header line | Expand/contract makes backward compatibility structural; the header puts the reminder where the decision is actually made.              | Plan     |
| Supporting work          | npm scripts, seed-config fix, runbook and document corrections    | Binds the gate's flags into a command so it cannot be run toothless, and stops the schema records contradicting the repository.         | Plan     |

Two decisions were considered and rejected during planning. **Migrations applied from CI** was raised as a way to make the rollback problem disappear; it does not — `vercel rollback` moves traffic while the schema stays put either way, so the pairing of old code with new schema is unchanged, and automation would additionally require a write credential in CI that `lessons.md:14-16` says must first be proven by hand. **Setting `auto_expose_new_tables = false`** was rejected because it governs only the local stack, and so would hide locally exactly the forgotten `revoke` that would then ship.

## Scope

**In scope:** the `supabase/migrations/` path; linking the hosted project; four npm scripts carrying the CLI flags; the `[db.seed]` configuration fix; one migration creating `public.collected_posts` locked by default; a deliberate gate violation to prove the check fails; the migration runbook in `CLAUDE.md`; corrections to `deploy-plan.md` and `infrastructure.md`.

**Out of scope:** any product schema (watchlist, games, extracted deals, user-owned tables — each later slice brings its own); importing the 659 collected posts (F-02); any policy on `collected_posts`; non-primary-key indexes; generated TypeScript types; a separate Supabase project for previews; local Docker verification.

## Architecture / Approach

The posture lives in the migration SQL, not in configuration: `enable row level security` plus `revoke all ... from anon, authenticated`, with no policy. Configuration governs the local stack; SQL governs wherever it is applied, which is what makes the two environments honest with each other. Verification runs on two levels — Supabase's security advisor as the broad gate (exit code), and a direct catalogue query against `pg_class.relrowsecurity`, `pg_policies` and `information_schema.role_table_grants` as the precise one, so the posture is read from the database rather than inferred from a check staying quiet.

`supabase db query --linked` reaches the hosted database through the Management API, which is what makes hosted-only verification workable: no connection string, no Docker, and no contact with `.env.local`.

## Phases at a Glance

| Phase                                              | What it delivers                                                                           | Key risk                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1. Migration path and the posture gate             | Linked project, four npm scripts, seed config settled, advisor baseline on an empty schema | The baseline may not be clean; if so, findings are recorded before tightening rather than the gate being loosened.        |
| 2. First migration — `collected_posts`             | The table, applied and verified by catalogue query                                         | A wrong column contract propagates into F-02's loader; the dry run and the Studio comparison exist to catch it early.     |
| 3. Prove the gate and record the runbook           | A watched gate failure, the `CLAUDE.md` runbook, corrected schema records                  | The probe table touches the production project — it goes through `db query`, never migration history, and drops same-sitting. |

**Prerequisites:** a Supabase account login for `supabase login`, the project reference and database password for `supabase link` (typed by the human — never read from `.env.local`), and network access to the hosted project. No prior roadmap item is required; F-01 has no prerequisites.

**Estimated effort:** one evening across three phases — the work is small and the waiting is mostly on the CLI.

## Open Risks & Assumptions

- **The advisor baseline is unobserved until the project is linked.** If it is not clean, Phase 1 records each pre-existing finding in the commit message and narrows the gate by scope; loosening `--fail-on` is not an option.
- **`major_version = 17` in `supabase/config.toml` has never been checked against the remote.** Phase 1 verifies it; if it differs, the config follows the remote.
- **Previews read and write the production Supabase project** (`infrastructure.md:110`). Not urgent for a table no deployed code reads, but it stops being harmless at S-02, when user-owned data appears. Carried forward as a known risk, not addressed here.
- **Manual apply allows drift** between the repository and the hosted schema. `npm run db:status` is the mitigation, and it only works if someone runs it.
- **The roadmap's F-01 outcome says "reproduced on a fresh local database"; this change proves only the hosted half.** The migration files make local reproduction available the moment Docker runs — it is the proof that is deferred, not the capability.

## Success Criteria (Summary)

- A new table can be added to this project only by writing a migration, and that migration is in the repository and on the hosted database, in agreement.
- A table shipped without row-level security fails `npm run db:check` — observed, not assumed.
- `public.collected_posts` exists with RLS on, zero policies and zero grants for `anon` and `authenticated`, ready for F-02 to write into.
