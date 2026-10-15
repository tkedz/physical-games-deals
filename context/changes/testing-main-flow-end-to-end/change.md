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

### 2026-10-15 — Phase 2

- **The self-seed also asks for a unique title.** The plan says to take the first card whose title has 3–100 characters. The spec takes the first one whose title also appears on no other card of `/`, because the snapshot lists different deals under one title (two „Limitowana Edycja Kolekcjonerska Halloween The Game” cards), and the `/my-deals` card is located by its title. On the seed and on today's snapshot, the pick is still D1.
- **The price is found by its shape.** The card has no label for the price, so the spec finds it by a text pattern (`PRICE`, digits, a comma, two digits, a currency) inside the card. It compares the link targets as the ordered list of `href`s.
- **No shared helper.** The sign-in hydration proof is copied from `auth.setup.ts`, which this change may not edit, so no helper file is shared. Sign-out is pressed until the header offers „Zaloguj się”, and only while its button is still there, because the button does nothing before the page hydrates.
- **The fixture's callback is named `provide`.** The React hooks lint rule takes a call named `use` for React's `use()`.
- **Exploration ran as a throwaway account.** The account was created with `npm run e2e:account`, signed in through the `setup` project, and deleted afterwards. The shared E2E user never added an entry.
- **Evidence.**
  - 2.1: on the build `webServer` runs, a search showed „Katalog gier jest chwilowo niedostępny” and `Obserwuj frazę „Gra Elden Ring PS5 Pudełkowa”`, and the server logged `misconfigured`.
  - 2.2 and 2.3: green alone in about 6 s, and three parallel attempts green in about 10 s each.
  - 2.4: with `loadMatchedDealsPage` returning no rows, the spec failed at the matched card (`toBeVisible`, step 6).
  - 2.5: with sign-out deleting the `sb-` cookies in the browser and never calling Auth, it failed at step 9: the replayed cookies opened `/my-deals`. On unbroken code the same replay lands on `/login`, so GoTrue rejects a revoked session's token. That settles the plan's open question.
  - 2.6: after every run, each attempt's annotated address reported "nothing to delete".
  - 2.9: Tomasz watched a headed run slowed to 800 ms per action and confirmed the flow. The slowdown came from a temporary config that imported `playwright.config.ts` and added only `launchOptions.slowMo`; it was deleted after the run. UI mode (`--ui`) was tried first: it lists only the `setup` project until `chromium` is ticked, runs headless, and showed him no steps.
