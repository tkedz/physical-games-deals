---
change_id: testing-main-flow-end-to-end
title: Testing main flow end to end
status: implementing
created: 2026-10-14
updated: 2026-10-15
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-10-15 — Phase 1

- **The local stack accepts `example.com`.** `TEST_EMAIL_DOMAIN` stays as planned. A throwaway account went through create, a second create ("already exists", GoTrue's `email_exists`), delete and a second delete ("nothing to delete"). No line printed the address or the password.
- **Beyond the contract in `scripts/e2e/accounts.mts`:**
  - every error it throws is a `TestAccountError`, whose message can be printed safely (a fixed text, a refusal naming only a host, or the Auth error code in `.code`), so the CLI prints only that, and only the class name of any other error;
  - it also exports the `E2eAdminClient` type;
  - `findTestAccountId` counts the `listUsers` pages itself (1000 per page, until an empty page), because auth-js 2.116.0's `nextPage` reads only the first digit of the page number;
  - the generated password is 24 ASCII characters, with symbols from the subset `!*-._~` of the rule's set, which needs no quoting in an env file.
- **CLI lines start with the outcome.** Each line is "created: …", "already exists: …", "deleted: …" or "nothing to delete: …", and names the variable `E2E_USERNAME`, never its value. On "already exists" the account keeps its old password, which the line says.
- **Deliberate breaks.** Each was a worktree-only edit, restored from the index. With `refuseE2eTarget`'s `hosted` branch disabled, 4 unit rows failed. With the generator's one-of-each characters removed, the 200-sample rule row failed. With the missing-key check disabled, 2 rows failed.
