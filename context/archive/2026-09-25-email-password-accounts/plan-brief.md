# E-mail and Password Accounts — Plan Brief

> Full plan: `context/changes/email-password-accounts/plan.md`

## What & Why

Collectors register and sign in with an e-mail address and a password. The app stays public by default: `/`, where S-01 will list every extracted deal, `/login`, `/signup` and every other path open without an account.

This is roadmap slice S-02 (PRD `FR-001`). Tomasz briefly asked for sign-in before anything else and withdrew it after reading the brief, because the deals feed is meant for visitors. Nothing is private until S-03's watchlist, and per-user data isolation rests on RLS.

## Starting Point

- **Session plumbing is in place:** `src/proxy.ts` refreshes the Supabase session with `getUser()` on every request.
- **Nothing else is:** there are no sign-in screens and no form components, and `/` renders a placeholder to anyone.
- **The hosted project runs on Supabase's defaults:** confirmation e-mails are on, and the built-in mailer reaches only members of the organisation.

## Desired End State

- **Visitors:** they see `/` with "Zaloguj się" and "Załóż konto" in the header. Unknown addresses show a 404.
- **Sign-up:** `/signup` creates an account that works immediately.
- **Signed-in users:** the header shows their e-mail and a sign-out that revokes the session on the server, for this device only. Opening `/login` or `/signup` sends them to `/`.
- **Demo account:** one exists for outside reviewers.
- **Session survival:** in production, the session outlives the access-token lifetime through the proxy's redirect.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Access model | Public by default; nothing is private until S-03 | S-01's deals feed on `/` is for visitors, and unknown addresses should 404 rather than ask for sign-in. | Tomasz |
| E-mail | None: "Confirm email" off, no password reset, no SMTP | The built-in mailer reaches only organisation members (2 e-mails/h), so open registration (PRD) works only without e-mail. | Tomasz |
| Input boundary contrast | Keep the preset's 1.66:1, below WCAG's 3:1 | Tomasz preferred recording the gap to changing the theme. | Tomasz |
| What the proxy decides | Only this: signed-in users go from `/login` and `/signup` to `/`, using the existing `getUser()` | No extra I/O (risk register); S-03 extends the same pure `decideAccess` for its private paths. | Plan |
| Redirect mechanics | `updateSession().redirectTo()` copies the cookies and the cache headers only | Keeps refreshed tokens and the closed CDN-leak fix, without internal `x-middleware-*` headers. | Plan |
| Auth calls | Browser client for sign-in, sign-up and sign-out; no Server Actions | Supabase rate limits stay on each user's IP; IP forwarding would need the secret key on Vercel. | Plan |
| Sign-out scope | `scope: "local"` | The default `global` would sign out every viewer of the demo account. | Plan |
| Where auth changes land | Always `/`, with a router refresh; no `next` parameter | `/` is the public home, and without the parameter there is no open-redirect surface. | Plan |
| Password rule | 8–72 characters plus a repeat field; the same minimum in the dashboard | With no reset path a typo is costly, and 72 is bcrypt's limit. | Plan |
| `getClaims()` migration | Not in this change | It would weaken immediate revocation and needs a signing-key check first. | Plan |
| Tests | No runner; pure functions with truth tables, `curl` matrices, browser checks | CLAUDE.md: the repository has no test runner. | Plan |

## Scope

**In scope:**

- `field`, `input` and `label` components, with their kitchen-sink states;
- hosted Auth settings (Tomasz), `/login`, `/signup`, and a header on `/` showing the auth state;
- the proxy's signed-in redirect, the `redirectTo()` contract and the CLAUDE.md rules;
- production acceptance, the demo account, and records in `infrastructure.md` and `deploy-plan.md`.

**Out of scope:**

- private views and their protection (S-03);
- e-mail flows (confirmation, reset, SMTP) and returning to the requested page;
- the `getClaims()` migration and a test runner;
- OAuth, magic link, MFA, CAPTCHA and account settings;
- any migration, and a Supabase project for previews;
- the input-contrast fix and the ui-init focus-indicator finding.

## Architecture / Approach

Request → `src/proxy.ts` → `updateSession()`, which refreshes the session and returns `{ response, user, redirectTo }` → the pure `decideAccess({ pathname, isSignedIn })` → `pass`, answered with `response`, or `redirect` (a signed-in user on `/login` or `/signup`), answered with `redirectTo("/")`.

The forms are client components that validate with pure zod schemas and call Supabase through the browser client. `(app)/layout.tsx` reads the user with `getCurrentUser()`, which can be `null`, and renders the header for either state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Form components | `field`/`input`/`label` and their kitchen-sink states | Registry output drifting from what the plan expects |
| 2. Flows | Hosted settings, `/signup`, `/login`, header with the auth state | Dashboard order (unconfirmed users); real test accounts in production |
| 3. Signed-in redirect | Proxy redirect with `redirectTo()`, CLAUDE.md rules | A redirect that drops refreshed cookies, causing random logouts |
| 4. Production acceptance | Session-survival test, demo account, records | Needs an hour of idle time and Tomasz's hands |

**Prerequisites:** Tomasz's access to the Supabase dashboard and SQL editor; network access to the shadcn registry; Tomasz starts `npm run dev` and `npm run start`.

**Estimated effort:** about 3 after-hours sessions across 4 phases, plus a one-hour idle wait in Phase 4.

## Open Risks & Assumptions

- Nothing enforces privacy by default. A private view added later must add its rule to `decideAccess` or check the user itself, or it opens for guests; its data stays behind RLS either way. CLAUDE.md states this for the next agent.
- `/` becomes dynamic because its header reads the session. S-01 decides how the deals feed is cached.
- The dark input boundary stays at 1.66:1: a known WCAG 1.4.11 gap on the sign-in forms.
- Anyone can register without proving the address, and a forgotten password has no self-service recovery.
- Dev and previews create real production accounts, and cleaning them up is manual.
- The unconfirmed-account behaviour behind the dashboard ordering comes from the Supabase Auth source, not the docs. Deleting those users first is cheap either way.

## Success Criteria (Summary)

- A visitor sees `/` and can reach sign-in and sign-up from its header, with no path asking for an account.
- A new user signs up and is in immediately, and sign-out ends this device's session on the server.
- After an hour idle on production, the proxy's redirect keeps the session and carries the refreshed cookies.
