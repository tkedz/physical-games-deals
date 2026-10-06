# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Separate logic from I/O and from components before tests arrive

- **Context**: The whole work cycle — from framing a change to reviewing its implementation.
- **Problem**: Extraction and matching baked into I/O calls and into async Server Components become untestable. The Next 16 docs state outright that async Server Components are not unit-testable, so adding tests later means rewriting the logic rather than adding test files.
- **Rule**: Keep domain decisions (extraction, matching, validation) in pure functions that take data and return data, with I/O injected; components and handlers only fetch and display. Keep the database schema in migrations in the repository so it can be reproduced locally.
- **Applies to**: implement, impl-review

## Prove a narrowed credential against the exact command before wiring it into CI

- **Context**: Setting up any pipeline that authenticates to a hosting platform — the first deployment, and every later credential rotation.
- **Problem**: Picking the narrowest credential scope is the right instinct, but tools do not always support it, and the resulting error names the wrong culprit. Vercel's project-scoped tokens deny every user-level and team-level request, while the Vercel CLI performs an account-level identity lookup on nearly every command, `vercel pull` included. The symptom is `Error: User not found. (404)` — indistinguishable from a truncated or mistyped value, which sends you re-creating the credential instead of widening its scope. Diagnosing it from CI logs alone cost two runs, and the first guess ("bad paste") was wrong.
- **Rule**: Before a credential goes into CI secrets, run the pipeline's own command against it locally — `vercel whoami --token=…`, then the real command. When an authentication error names the *identity* (`user not found`, `account not found`) rather than the *resource* (`forbidden`, `no access to project X`), suspect the scope, not the value. Record next to the secret which scope the tool actually requires and why, so the next rotation does not repeat the diagnosis. Never paste the credential into an agent conversation to test it — run the check yourself.
- **Applies to**: plan, implement, impl-review

## A gate that exits 0 on warnings is not a gate

- **Context**: Wiring CI quality checks, especially in a repository with no test runner, where lint and formatting carry the whole signal.
- **Problem**: `eslint` exits 0 when it reports only warnings, and `eslint-config-next` classifies real defects — unused variables among them — as warnings. A `verify` job running plain `eslint` therefore goes green while printing the problem it was hired to catch, and the deploy proceeds. The gate looks present in the workflow file and is absent in behaviour.
- **Rule**: Make the check fail on everything you would not merge: `eslint --max-warnings 0`. Tighten it while the baseline is clean, so the change blocks nothing that already exists. Then prove the gate by breaking it on purpose once — a deliberate violation on a branch, confirming the deploy job never starts — because a gate nobody has seen fail is an assumption, not a control.
- **Applies to**: implement, impl-review

## Record every departure from the plan in change.md, in the commit that makes it

- **Context**: Implementing a phase, delegated ones above all, and triaging an implementation review.
- **Problem**: Once implementation starts the plan is read-only, and nothing else in the cycle writes the departures down. A subagent's adaptations reach only the conversation. A review-triage fix lands in the code and in the review report, while the plan still states the old rule. The next review compares the code against the plan and flags each departure again as undocumented drift. In physical-deals-from-real-posts, Phase 4's adaptations had to be recorded after the fact (F9), and four triage fixes changed rules the plan still states (F1, F2, F4, F6).
- **Rule**: When code departs from the plan, append a dated note to the change's change.md in the same commit, naming what differs and where the decision lives. The departure may be an adaptation reported by whoever implemented the phase, or a fix chosen in review triage, whose decision lives in the review report. Commit triage fixes before the change moves on, so the departure is also in git history.
- **Applies to**: implement, impl-review
