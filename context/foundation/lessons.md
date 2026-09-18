# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Separate logic from I/O and from components before tests arrive

- **Context**: The whole work cycle — from framing a change to reviewing its implementation.
- **Problem**: Extraction and matching baked into I/O calls and into async Server Components become untestable. The Next 16 docs state outright that async Server Components are not unit-testable, so adding tests later means rewriting the logic rather than adding test files.
- **Rule**: Keep domain decisions (extraction, matching, validation) in pure functions that take data and return data, with I/O injected; components and handlers only fetch and display. Keep the database schema in migrations in the repository so it can be reproduced locally.
- **Applies to**: implement, impl-review
