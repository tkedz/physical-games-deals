# E-mail and Password Accounts (email-password-accounts) Implementation Plan

## Overview

Users register and sign in with an e-mail address and a password on Supabase Auth. The app stays public by default: `/`, `/login`, `/signup` and every other path open without an account. `/` is where S-01 will list every extracted deal. Signed-in users who open `/login` or `/signup` are sent to `/`. Nothing is private yet; the first private view arrives with S-03's watchlist.

This is roadmap slice S-02 (PRD `FR-001`, `## Access Control`). On 2026-09-25 Tomasz first asked for sign-in before anything else. He withdrew that after reading the brief, because S-01's deals feed on `/` is meant for visitors.

The change sends no e-mail. Address confirmation is turned off in the hosted project, and there is no password reset. The change closes with two things:

- the production acceptance test that `context/foundation/infrastructure.md` assigns to "whichever change introduces auth";
- a demo account that can be handed to an outside reviewer.

## Current State Analysis

- **The session plumbing works, but nothing uses it.**
  - `src/proxy.ts:11-13` calls `updateSession()` for every request the matcher at `src/proxy.ts:21` covers.
  - `src/utils/supabase/session.ts:45` calls `getUser()`, which refreshes an expired access token through `setAll` (`:21-36`). `:52` returns `supabaseResponse`.
  - There are no sign-in screens, no route protection and no Server Actions.
  - `src/utils/supabase/client.ts` and `server.ts` are not imported anywhere.
- **Views.**
  - `src/app/page.tsx` is a Polish placeholder that anyone can see.
  - `src/app/kitchen-sink/page.tsx` renders under `next dev` and is a 404 in production builds (`src/lib/kitchen-sink.ts`).
- **Design system.**
  - shadcn `base-nova` on Base UI, with six components: `alert`, `badge`, `button`, `card`, `empty` and `skeleton`. There is no input, label or field.
  - Tokens live in `src/app/globals.css:62-129`. Dark mode is forced (`src/app/layout.tsx:27`).
- **Hosted Supabase Auth.**
  - Its settings are not recorded anywhere in the repo.
  - The documented hosted defaults: "Confirm email" is on, and the built-in mailer delivers only to members of the organisation, at 2 e-mails an hour. The minimum password length is 6 (from the Auth server's default).
  - `supabase/config.toml:229` (`enable_confirmations = false`) and `:185` (`minimum_password_length = 6`) govern only the local stack.
- **One Supabase project.** Dev and Vercel previews both read and write production (`context/deployment/deploy-plan.md:87`), so every test account is a real account. Previews sit behind Vercel Authentication.
- **Records this change resolves.** Two items were deferred until a login flow existed:
  - the conclusive proxy test (`infrastructure.md:150`, `deploy-plan.md:68`);
  - the Supabase URL configuration (`deploy-plan.md:114`).
- **Verification tooling.** There is no test runner (CLAUDE.md, Verification). The visual gate is manual screenshots taken through the browser, as in ui-init.

## Desired End State

- **Access.**
  - Every path is public. A signed-out visitor opens `/`, `/login`, `/signup` and any other route as today. Unknown addresses show the 404 page, and `/kitchen-sink` keeps its own dev-and-preview guard.
  - A signed-in request for `/login` or `/signup` gets a 307 to `/`.
- **Sign-up and sign-in.**
  - `/signup` creates an account from an e-mail, a password of 8–72 characters and a repeated password, then lands on `/` signed in.
  - `/login` signs in and lands on `/`.
  - Both forms show Polish field errors and a single form-level error per failure. Neither sends a request that validation has already rejected.
- **`/`.**
  - The existing placeholder sits under a header. Signed out, the header offers "Zaloguj się" and "Załóż konto". Signed in, it shows the e-mail and "Wyloguj się".
  - Signing out revokes the current session in Supabase while other devices stay signed in. It clears the cookies and returns to `/` in the signed-out state, and Back does not bring the signed-in header back.
- **Redirects.** The proxy's redirect carries the refreshed session cookies and the library's cache headers.
- **Hosted Auth.**
  - "Confirm email" is off, the minimum password length is 8, and the Site URL points at production.
  - A demo account exists. Its credentials live only with Tomasz.
- **Records.** `infrastructure.md` and `deploy-plan.md` record the conclusive proxy test as done and the URL configuration as resolved.

### Key Discoveries:

- **The proxy can decide with the result of the existing `getUser()` call.**
  - That call goes to the Auth server over the network and rejects a revoked session immediately: 403 `session_not_found` becomes `user: null`, and the cookies are cleared through `setAll`. Sources: Supabase Auth `maybeLoadUserOrSession`; auth-js `_getUser`.
  - `getClaims()`, by contrast, would accept a revoked token until it expires.
  - The risk register asks for no extra I/O in the proxy (`infrastructure.md:127`), and the redirect adds none.
- **A redirect built next to `supabaseResponse` must carry both its cookies and its cache headers.**
  - Refreshed tokens land on `supabaseResponse` in `setAll`. A fresh `NextResponse.redirect()` without them makes the browser and the server disagree about the session (the warning at `session.ts:47-51`).
  - Without the cache headers, a CDN may serve one user's refreshed session to another. This is a closed risk (`infrastructure.md:134`).
  - The Next 16 docs do not cover this copying. It is an `@supabase/ssr` concern.
- **Calling Auth from the browser keeps Supabase's per-IP rate limits on the user's own IP.**
  - Server-side calls are charged to the server's IP, which is Vercel's egress address. They share the token bucket with the proxy's session refreshes: 150 per 5 minutes, burst 30.
  - The documented remedy, `Sb-Forwarded-For`, needs the secret key in the runtime, and CLAUDE.md keeps that key off Vercel.
  - The official Supabase Next.js template (`vercel/next.js` `examples/with-supabase`) also signs in, signs up and signs out from client components.
  - Next 16's own guide shows Server Actions. With none here, the change adds no POST entry point; an action is reachable by direct POST (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:78`).
- **`signOut()` defaults to `scope: 'global'`.**
  - `global` deletes every session the user has, so one viewer of the demo account would sign out all the others.
  - `local` deletes only the current session row.
  - If `/logout` fails for any reason other than 401, 403 or 404, supabase-js returns the error and keeps the session.
- **With "Confirm email" off, `signUp` returns a session.**
  - A confirmed address that already exists fails with 422 `user_already_exists`.
  - An address left unconfirmed by an earlier attempt behaves differently. After the switch, `signUp` for it confirms that account and returns a session without checking the password it was created with (Supabase Auth, `signup.go`). This is why the dashboard steps have a fixed order (Critical Implementation Details).
- **Error codes the forms see.** Branch on `error.code`, never on the message. All the guards below are exported by `@supabase/supabase-js`.
  - `invalid_credentials` (400): a wrong password and an unknown address alike.
  - `user_already_exists` (422).
  - `weak_password` (422). `AuthWeakPasswordError` is not an `AuthApiError`, so detect it with `isAuthWeakPasswordError`.
  - `email_address_invalid` (400): example and test domains.
  - `validation_failed` (400): for example, a password over 72 characters.
  - `over_request_rate_limit` (429).
  - `email_not_confirmed` (400).
  - Network failures and 5xx responses carry no code. They match `isAuthRetryableFetchError`.
- **The proxy runs on Node.js for every matched request, RSC and prefetch requests included.**
  - The docs say the proxy "should not be your only line of defense" (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1121`, `03-api-reference/03-file-conventions/proxy.md:249-255`).
  - Nothing in this change is private. When S-03 adds a private view, the proxy can pre-filter it, while RLS (F-01) stays the data boundary.
  - Layout checks do not re-run on client navigation (`authentication.md:1352`), so they cannot protect a view.
- **Reading the session with no session cookie costs nothing.** supabase-js `getUser()` returns `AuthSessionMissingError` without a network request when there is no session. A signed-out visit to `/` therefore makes no Auth call.
- **The registry has what the form needs.** Checked with `npx shadcn view field input label` on 2026-09-25:
  - `field` depends on `label` and `separator`;
  - `input` wraps `@base-ui/react/input`;
  - all of them import `cn`, like the existing components, and use existing tokens only;
  - `FieldError` renders `role="alert"`.
- **The dark input boundary is 1.66:1.**
  - `--input` is oklch(0.32) on a black background; on a card it is 1.57:1. WCAG 1.4.11 asks for 3:1.
  - ui-init handed this to this change (`context/changes/ui-init/plan.md:88`). Tomasz accepted it as it is on 2026-09-25 (What We're NOT Doing).
  - The input's focus border uses `--ring` (8.46:1) and is unaffected.
- **The matcher decides where the proxy runs.** `src/proxy.ts:21` excludes `_next/static`, `_next/image`, `favicon.ico` and image extensions. `/login` and `/signup` must stay matched, or the signed-in redirect stops working.

## What We're NOT Doing

- **No e-mail of any kind** (Tomasz, 2026-09-25).
  - No address confirmation, no password reset and no custom SMTP.
  - No `/auth/confirm` or `/auth/callback` route.
  - A forgotten password has no self-service path. Tomasz can reset it through the Admin API or delete the account.
- **No change to the input boundary contrast** (Tomasz, 2026-09-25). `--input` keeps the preset value and `input.tsx` stays as the registry ships it. The 1.66:1 dark boundary is an accepted, recorded gap.
- **No private views and no protection for private paths** (Tomasz, 2026-09-25: public by default).
  - Nothing in the app is private until S-03's watchlist. S-03 adds its paths to `decideAccess` and proves the sign-in redirect on a real view.
  - The roadmap's S-02 clause "is sent away from private views when not signed in" therefore has no subject yet; S-03 delivers it.
- **No return to the originally requested page.** Sign-in always lands on `/`. Revisit this with S-03, when private deep links exist; it needs same-origin validation of a `next` parameter.
- **No `getUser()` → `getClaims()` migration**, which stays deferred (`deploy-plan.md:112`). It would weaken immediate revocation, and it needs the signing-key type checked first.
- **No test runner** (CLAUDE.md, Verification). The pure functions are shaped for one (Testing Strategy).
- **No Server Actions and no Route Handlers.**
- **No magic link, OAuth, MFA, CAPTCHA or rate-limit IP forwarding.**
- **No account settings:** the UI offers no password change, e-mail change or account deletion.
- **No database change:** no migration and no profile table.
- **No separate Supabase project for previews** (`deploy-plan.md:87`).
- **No fix for the focus indicator on outline and destructive buttons.** ui-init deferred it (`context/changes/ui-init/change.md:14-26`). The header's buttons and links avoid those two variants.
- **No `robots` or `noindex` handling.**

## Implementation Approach

Build bottom-up:

1. **Design system first.** The form primitives and their states land in the kitchen sink before any view depends on them.
2. **Flows next.** Sign-up, sign-in and sign-out work, and `/` shows the auth state in its header.
3. **Proxy redirect last.** A pure decision (`decideAccess`) that the proxy applies to the result of the `getUser()` call that already runs: signed-in users are sent from `/login` and `/signup` to `/`. `updateSession()` gains a redirect helper that owns the copying of cookies and headers; the first private view (S-03) reuses it.
4. **Acceptance in production.** The session-survival test (more than an hour idle) and the demo account belong there.

The domain decisions live in pure functions under `src/lib/auth/` (`context/foundation/lessons.md`, "Separate logic from I/O"): which paths the proxy redirects, what a valid credential looks like, and what each error code means to the user. Components only call Supabase and render.

## Critical Implementation Details

### Dashboard order: clear unconfirmed users before turning off "Confirm email"

With confirmations off, `signUp` for an address left unconfirmed by an earlier attempt confirms that account and returns a session. It does not check the password the account was created with. So Tomasz first deletes every user marked "Waiting for verification", and only then flips the switch.

### Redirects carry the cookies and only the cache headers

`redirectTo()` copies onto the redirect:

- every cookie from `supabaseResponse`;
- the headers the library passed to `setAll`: `Cache-Control`, `Expires` and `Pragma`.

It does not copy the whole header set. `NextResponse.next({ request })` carries Next's internal `x-middleware-*` headers, which do not belong on a redirect.

`getUser()` stays the first statement after `createServerClient()`, and `setAll` keeps its second argument (`infrastructure.md:134`).

### Sign-in state changes discard the client router cache

After a sign-in, sign-up or sign-out, the next render must come from the server with the new cookies. So the forms and the sign-out button navigate to `/` and refresh the router, which stops Back from restoring the signed-in header from memory after sign-out.

A failed `signOut()` keeps the session in supabase-js. The button therefore reports the failure and stays put. It never navigates while the session is still alive.

### Who runs what

- `npm run dev` and `npm run start` load `.env.local`, so Tomasz starts them, as in ui-init.
- `npm run build`, `npm run lint` and `npm run format:check` stay agent-run.
- Tomasz makes every Supabase dashboard change and every sign-up and sign-in with real credentials.
- Tomasz also runs the `auth.sessions` count in the SQL editor, because the agent has no SQL route to the hosted project.
- The agent runs `curl` against a server Tomasz has started and takes the screenshots. It also exercises what needs no credentials: client-side validation errors, and a sign-in with an address that has no account.
- Credentials never enter the conversation or the repository. For signed-in screenshots, Tomasz signs in inside the browser window the agent drives.
- Test sign-ups use addresses Tomasz controls; plus-addressing works. Example and test domains are rejected with `email_address_invalid`, and every account created in dev or on a preview is a production account.

## Phase 1: Form components in the design system

### Overview

`field`, `input` and `label` join `src/components/ui/`, together with `separator`, which `field` pulls in. The kitchen sink renders their states. Nothing user-facing changes yet.

### Changes Required:

#### 1. Components

**Files**: `src/components/ui/field.tsx`, `input.tsx`, `label.tsx`, `separator.tsx` (new)

**Intent**: Add the form primitives the sign-in and sign-up views need, through the stack's own path. Views then import them instead of hand-rolling inputs.

**Contract**:

- Run `npx shadcn add field input`. It needs network access to the shadcn registry. `label` and `separator` arrive as `field`'s registry dependencies.
- Run `npm run format` afterwards.
- Make no hand edits beyond formatting. The border, token and focus classes stay as shipped, because the boundary-contrast gap is accepted as it is.
- `button.tsx`, `globals.css`, `components.json`, `package.json` and `package-lock.json` stay unchanged.

#### 2. Kitchen-sink form states

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Render every field state the auth forms use, with Polish sample copy, so the visual gate covers them before any view depends on them.

**Contract**: A new section, "Formularz", between "Karta" and "Stany". It uses only `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError` and `Input`, and holds four fields:

1. **Default:** label "E-mail", `type="email"`.
2. **With a description:** label "Hasło", `type="password"`, description "Co najmniej 8 znaków."
3. **Invalid:** `data-invalid="true"` on the field and `aria-invalid` on the input. The error "Podaj adres e-mail w poprawnym formacie." is linked to the input through `aria-describedby`.
4. **Disabled:** `data-disabled="true"` on the field and `disabled` on the input.

Each label is bound to its input with `htmlFor`/`id`. At 375 px the section is a single column with no horizontal scroll.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes (run `npm run format` first if needed)
- `npm run build` succeeds with `/kitchen-sink` still prerendered as not found
- `git status --porcelain src/components/ui` lists exactly `field.tsx`, `input.tsx`, `label.tsx` and `separator.tsx` as new
- `git diff --quiet -- package.json package-lock.json components.json src/app/globals.css` exits 0
- `grep -rEn '(zinc|slate|gray|neutral|stone)-[0-9]|(bg|text|border)-(black|white)|#[0-9a-fA-F]{3,8}\b' src/app --include=*.tsx` prints nothing

#### Manual Verification:

- With `npm run dev` started by Tomasz, screenshots of the kitchen sink's "Formularz" section at 1280 px and 375 px, saved to `context/changes/email-password-accounts/screenshots/`, show all four states with no horizontal scroll
- Tab reaches each enabled input with a visible focus ring and skips the disabled one, and clicking a label focuses its input
- DevTools contrast checks put the error text and the description text at 4.5:1 or more on the background

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Sign-up, sign-in and sign-out

### Overview

- Tomasz switches the hosted project to the agreed Auth settings.
- `/signup` and `/login` work through the browser client.
- `/` moves under a layout whose header shows the auth state: "Zaloguj się" and "Załóż konto" when signed out, and the e-mail and "Wyloguj się" when signed in.
- The proxy does not redirect anything yet.

### Changes Required:

#### 1. Hosted Auth settings (Tomasz, Supabase dashboard)

**Intent**: Make open registration work without e-mail, and align the server-side password rule with the form, before anyone signs up.

**Contract**, in this order:

1. **Authentication → Users:** delete every user marked "Waiting for verification" (Critical Implementation Details).
2. **Authentication → Sign In / Providers → Email:** turn "Confirm email" off and set the minimum password length to 8. "Allow new users to sign up" stays on.
3. **Authentication → URL Configuration:** set the Site URL to `https://physical-games-deals.vercel.app`. Add no redirect URLs: password sign-in performs no redirect. The Site URL only keeps any future Supabase e-mail from pointing at localhost.

#### 2. Local Auth config

**File**: `supabase/config.toml`

**Intent**: Keep the local stack's rules identical to the hosted ones, so a local run cannot disagree with production.

**Contract**:

- Set `minimum_password_length = 8` (`[auth]`, line 185).
- Add a one-line comment at `enable_confirmations = false` (line 229) saying that the hosted project matches it since this change.
- `site_url` stays local.

#### 3. Credential rules and error copy

**File**: `src/lib/auth/credentials.ts` (new)

**Intent**: Keep two things in pure, importable code shared by both forms (lessons.md): what counts as a valid credential, and what each Supabase error means to the user.

**Contract**:

- **`signInSchema` (zod):**
  - `email`, trimmed and in e-mail format;
  - `password`, non-empty but with no length rule, so an account created under other rules can still sign in.
- **`signUpSchema` (zod):**
  - `email`, as above;
  - `password`, 8–72 characters. 72 is bcrypt's limit; anything longer would come back as `validation_failed`;
  - `passwordRepeat`, which must equal `password`, with the error attached to `passwordRepeat`.
- **Field messages:**

  | Rule | Message |
  | --- | --- |
  | e-mail format | "Podaj adres e-mail w poprawnym formacie." |
  | empty password (sign-in) | "Podaj hasło." |
  | too short | "Hasło musi mieć co najmniej 8 znaków." |
  | too long | "Hasło może mieć najwyżej 72 znaki." |
  | passwords differ | "Hasła nie są takie same." |

- **`authErrorMessage(error)`** takes the `error` supabase-js returned and never reads `error.message`. It returns Polish copy by code:

  | Code | Message |
  | --- | --- |
  | `invalid_credentials` | "Nieprawidłowy e-mail lub hasło." |
  | `user_already_exists` | "Konto z tym adresem już istnieje. Zaloguj się." |
  | `weak_password` (via `isAuthWeakPasswordError`) | "To hasło jest zbyt słabe. Wybierz inne." |
  | `email_address_invalid` | "Tego adresu e-mail nie da się użyć. Podaj inny." |
  | `over_request_rate_limit` | "Zbyt wiele prób. Spróbuj ponownie za kilka minut." |
  | `email_not_confirmed` | "To konto nie ma potwierdzonego adresu e-mail." |
  | retryable fetch errors | "Nie udało się połączyć z serwerem. Spróbuj ponownie." |
  | anything else | "Coś poszło nie tak. Spróbuj ponownie." |

#### 4. Auth views

**Files**: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx` (new)

**Intent**: Two public views, each with the product name and one form, sharing a centred layout.

**Contract**:

- **Layout:** a single centred column (`max-w-sm`, 16 px side gutter). The heading is the working product name "Okazje na gry pudełkowe", linking to `/`.
- **`/login`:** metadata title "Logowanie", `SignInForm`, and the link "Nie masz konta? Załóż konto" to `/signup`.
- **`/signup`:** metadata title "Rejestracja", `SignUpForm`, and the link "Masz już konto? Zaloguj się" to `/login`.
- Semantic tokens and repo components only.

#### 5. Forms

**Files**: `src/components/auth/sign-in-form.tsx`, `src/components/auth/sign-up-form.tsx` (new)

**Intent**: Client components that validate with the shared schemas and call Supabase from the browser, which keeps the rate limits on each user's own IP (Key Discoveries).

**Contract**:

- **Setup:** `"use client"`, with the client from `@/utils/supabase/client`. The form carries `noValidate`, so the schemas' Polish messages are the only validation UX.
- **Invalid input:** each field error renders in its `FieldError`, the input gets `aria-invalid` plus `aria-describedby` pointing at the error, and no request is sent.
- **Valid input:**
  - the form calls `signInWithPassword` or `signUp`;
  - while pending, the submit button is disabled and reads "Logowanie…" or "Zakładanie konta…";
  - an error renders once, from `authErrorMessage`, in an `Alert` (`destructive`) above the button.
- **Success:** navigate to `/` with a router refresh (Critical Implementation Details).
- **Sign-up without a session:** this is only possible if "Confirm email" is switched back on. The form does not navigate; it shows a neutral notice that the account must be confirmed before sign-in.
- **Fields:**

  | Field | `type` | `autoComplete` | Label |
  | --- | --- | --- | --- |
  | e-mail | `email` | `email` | "E-mail" |
  | sign-in password | `password` | `current-password` | "Hasło" |
  | sign-up password | `password` | `new-password` | "Hasło" |
  | sign-up repeat | `password` | `new-password` | "Powtórz hasło" |

  Each field has a bound `FieldLabel`. The sign-up password carries the description "Od 8 do 72 znaków."
- **Submit labels:** "Zaloguj się" and "Załóż konto".

#### 6. Header on `/`

**Files**:

- `src/app/page.tsx` → `src/app/(app)/page.tsx` (moved, content unchanged);
- `src/app/(app)/layout.tsx`, `src/lib/auth/current-user.ts`, `src/components/auth/sign-out-button.tsx` (new).

**Intent**: Every product view gets one header that shows the auth state: a way in for visitors, and who is signed in plus a way out for users.

**Contract**:

- **`getCurrentUser()`:**
  - server-only, because it uses `@/utils/supabase/server`;
  - returns the user from `getUser()`, or `null` when there is no session. It never redirects: `/` is public;
  - wrapped in React `cache`, so a later page in the same render reuses the result.
- **`(app)/layout.tsx`:** a header with the product name linking to `/`, followed by the page. At 375 px the header wraps without horizontal scroll.
  - **Signed out:** the links "Zaloguj się" (`/login`) and "Załóż konto" (`/signup`).
  - **Signed in:** the user's e-mail in `text-muted-foreground`, and `SignOutButton`.
  - The links are styled with `buttonVariants`, not in the `outline` or `destructive` variant: the focus indicator on those two is the open ui-init finding.
- **`SignOutButton`:**
  - `"use client"`; calls `signOut({ scope: "local" })`;
  - on success it navigates to `/` with a router refresh;
  - on error it stays and shows "Nie udało się wylogować. Spróbuj ponownie.";
  - it is disabled while pending, and its label is "Wyloguj się";
  - `Button` variant `ghost`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes
- `npm run build` succeeds and its route list includes `/login` and `/signup`
- The palette-literal grep from Phase 1, run over `src/app` and `src/components/auth`, prints nothing
- `grep -rn '"use server"' src` prints nothing
- `grep -rn 'scope: "local"' src/components/auth` prints exactly one line
- `git diff --quiet -- package.json package-lock.json` exits 0

#### Manual Verification:

The first check follows the 10x-ui merge checklist: entry points are checked logged out (`.claude/skills/10x-ui/references/ui-quality-checklist.md:10`).

- Signed out, `/` shows the placeholder with "Zaloguj się" and "Załóż konto" in the header, and each link opens its form
- Tomasz confirms the three dashboard steps were done in order, with no unconfirmed user left when "Confirm email" was switched off
- Signing up in dev with a fresh address Tomasz controls lands on `/`, whose header shows that address
- Signing up again with the same address shows "Konto z tym adresem już istnieje. Zaloguj się." and adds no user
- On `/signup`, the agent's 7-character password and mismatched repeat each show their field error, and DevTools → Network shows no request to `/auth/v1/signup`
- On `/login`, the agent's address with no account shows "Nieprawidłowy e-mail lub hasło.", the same message Tomasz gets for his own address with a wrong password
- Tomasz's SQL-editor count of the test user's rows in `auth.sessions` drops by exactly one after "Wyloguj się", while a second signed-in browser stays signed in
- After sign-out the page is `/`, its header shows "Zaloguj się" and "Załóż konto" without a manual reload, and Back does not bring back the signed-in header
- Screenshots at 1280 px and 375 px of `/login` (idle and with the error alert), `/signup` (idle and with field errors), and `/` signed out and signed in (Tomasz signs in inside the agent's browser window), saved to `context/changes/email-password-accounts/screenshots/`, show no horizontal scroll
- On each form, Tab moves through e-mail, password, repeat (sign-up only), submit and the link to the other form, each with a visible focus indicator

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Signed-in redirect in the proxy

### Overview

The proxy sends signed-in requests for `/login` and `/signup` to `/`. It decides with the user that the existing `getUser()` call already returns, and it redirects in a way that keeps the refreshed session. Every other request passes as before.

### Changes Required:

#### 1. Access decision

**File**: `src/lib/auth/access.ts` (new)

**Intent**: One pure function states the access rule, so it reads at a glance, a future test runner can cover its truth table (Testing Strategy), and S-03 extends it when the first private view arrives.

**Contract**: `decideAccess({ pathname, isSignedIn }): { kind: "pass" } | { kind: "redirect"; to: "/" }`.

- The auth pages are exactly `/login` and `/signup`: exact, case-sensitive matches with no sub-paths.
- Signed in on an auth page: redirect to `/`.
- Everything else passes, signed in or not.

#### 2. Session contract

**File**: `src/utils/supabase/session.ts`

**Intent**: Hand the proxy the user from the existing refresh call, and give it the only sanctioned way to build a redirect that keeps the session intact.

**Contract**:

```ts
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse; // supabaseResponse, returned untouched on "pass"
  user: User | null; // from the existing getUser() call
  redirectTo(pathname: string): NextResponse; // cookies + the setAll cache headers copied
}>;
```

- `getUser()` stays the first statement after `createServerClient()`.
- `setAll` keeps its `headers` argument and records those headers for `redirectTo`.
- The comments at `:41-51` describe the new contract instead of "return exactly this object".

#### 3. Proxy

**File**: `src/proxy.ts`

**Intent**: Apply the decision to every matched request.

**Contract**:

- `proxy()` returns `response` for `pass` and `redirectTo(to)` for `redirect`.
- `pathname` comes from `request.nextUrl.pathname`, and `isSignedIn` is `user !== null`.
- The matcher stays as it is. The file comment states that `/login` and `/signup` must stay matched.

#### 4. Project rules

**File**: `CLAUDE.md` (Supabase section, line 23)

**Intent**: Keep the rules file true to the new contract, as the risk register asks for any change to that line (`infrastructure.md:128`).

**Contract**: Facts only; the reasoning stays in code comments and in this plan.

- **Replace the `session.ts` bullet with:**
  - do not move `await supabase.auth.getUser()`;
  - `updateSession()` returns `supabaseResponse` together with the user;
  - any redirect goes through its `redirectTo()`, which copies the cookies and cache headers;
  - returning any other response causes random logouts.
- **Add a bullet:** every path is public.
  - `src/proxy.ts` only sends signed-in users from `/login` and `/signup` to `/` (`src/lib/auth/access.ts`).
  - Nothing enforces privacy by default: a private view needs its own rule there.
  - Its data stays behind RLS either way.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes
- `npm run build` succeeds
- `test ! -e src/middleware.ts && grep -q "export async function proxy" src/proxy.ts` exits 0
- `grep -n "setAll(cookiesToSet, headers)" src/utils/supabase/session.ts` prints exactly one line

#### Manual Verification:

- With `npm run build && npm run start` run by Tomasz, the agent's signed-out `curl -sI` returns 200 for `/`, `/login`, `/signup`, `/favicon.ico` and one `/_next/static/` asset linked from `/login`
- The same `curl -sI` returns 404 for `/does-not-exist` and `/kitchen-sink`
- Signed in, Tomasz opens `/login` and `/signup` from the address bar and lands on `/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Production acceptance and records

### Overview

The flows and the proxy redirect are proven on production:

- the session survives the access-token lifetime through the proxy's redirect;
- a demo account exists;
- the test accounts are gone;
- the deferred records are closed.

### Changes Required:

#### 1. Deploy (Tomasz)

**Intent**: Production runs all three phases. Deployment is a merge to `main`, not an agent action (`infrastructure.md:114`).

**Contract**: CI is green on `main`, and the production deployment is `Ready`.

#### 2. Demo account (Tomasz)

**Intent**: Provide what the PRD chose password accounts for: a prepared account an outside reviewer can use (`FR-001`).

**Contract**: Created through production `/signup` with an address Tomasz controls. The credentials live only in his password manager: never in the repository, the conversation or a commit.

#### 3. Test-account cleanup (Tomasz)

**Intent**: Dev and previews wrote real accounts into production.

**Contract**: Authentication → Users holds only Tomasz's own account and the demo account.

#### 4. Records

**Files**: `context/foundation/infrastructure.md`, `context/deployment/deploy-plan.md`

**Intent**: Close the two items that were deferred until a login flow existed, and record the new preview fact, each under its file's own rules for change.

**Contract**:

- **`infrastructure.md`, Setup** (kept current):
  - item 6 becomes done, with the date and what the test showed;
  - its "an `/auth/callback` route first" is corrected: password sign-in needs no callback.
- **`infrastructure.md`, Risk Register** (append-only): a new Open row.
  - Risk: previews and dev sign up real accounts in the production Supabase project.
  - Mitigation: previews sit behind Vercel Authentication; test accounts are deleted after verification; a separate Supabase project once there is user data.
- **`deploy-plan.md`** (a dated record):
  - the Deferred item "Supabase auth redirect URLs" gains a dated resolution note: the Site URL is set, and no redirect URLs are needed because password sign-in performs no redirect;
  - the "On `proxy.ts`" paragraph (line 68) gains a pointer to `infrastructure.md` Setup item 6.
- Each note names `email-password-accounts`.

### Success Criteria:

#### Automated Verification:

- `grep -c "email-password-accounts" context/foundation/infrastructure.md context/deployment/deploy-plan.md` reports at least one match in each file

#### Manual Verification:

- CI is green on `main` and the production deployment is `Ready`
- The agent's signed-out `curl -sI` against `https://physical-games-deals.vercel.app` returns 200 for `/`, `/login` and `/signup`, and 404 for `/kitchen-sink`
- Tomasz signs in to production with the demo account from a private window and lands on `/`, whose header shows the demo address
- After more than an hour idle on production, Tomasz's first request, `/login` from the address bar, lands on `/` still signed in; the 307 carries `Set-Cookie` and `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, and a reload of `/` stays signed in
- Authentication → Users lists only Tomasz's own account and the demo account

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

There are none: the repository has no test runner (CLAUDE.md, Verification). The pure functions are shaped so that a future runner can cover them.

- **`decideAccess`** truth table:

  | Signed in | Path | Result |
  | --- | --- | --- |
  | no | `/`, `/login`, `/signup`, `/kitchen-sink`, `/does-not-exist` | pass |
  | yes | `/login`, `/signup` | redirect to `/` |
  | yes | `/`, `/kitchen-sink`, `/login/extra`, `/LOGIN` | pass |

- **`signUpSchema`:**
  - a 7-character password is rejected; 8 and 72 characters are accepted; 73 is rejected;
  - a mismatched repeat is rejected, on `passwordRepeat`;
  - an e-mail without `@` is rejected;
  - surrounding spaces are trimmed.
- **`signInSchema`:** a 6-character password is accepted.
- **`authErrorMessage`:**
  - each listed code maps to its message;
  - a `weak_password` error reaches its message through `isAuthWeakPasswordError`;
  - an unknown code and a non-Supabase error both get the generic message.

### Integration Tests:

There are none. The `curl` matrices in Phases 3 and 4 and the manual flows stand in for them.

### Manual Testing Steps:

1. Tomasz applies the dashboard settings in order and starts `npm run dev`.
2. Check the kitchen sink's "Formularz" section at 1280 px and at 375 px, and tab through it.
3. Signed out, `/` shows "Zaloguj się" and "Załóż konto" in the header.
4. Sign up with a fresh address: `/` shows the address in the header. Sign up again with it: "account exists".
5. On `/signup`, the validation errors appear with no network request. On `/login`, an unknown address gets the generic error.
6. Sign out:
   - the `auth.sessions` count drops by one;
   - a second browser stays signed in;
   - `/` returns to the signed-out header, and Back does not restore the signed-in one.
7. Tomasz runs `npm run build && npm run start`, and the agent runs the signed-out `curl` matrix. Tomasz checks that a signed-in visit to `/login` or `/signup` redirects to `/`.
8. After the merge:
   - the production `curl` matrix;
   - the demo account;
   - the session-survival test after more than an hour idle;
   - the account cleanup.

## Performance Considerations

- The proxy adds no I/O. It reads the user that the existing `getUser()` already fetched (`infrastructure.md:127`).
- `/` becomes dynamic, because its layout reads the session for the header.
  - A signed-out visit makes no Auth call: without a session cookie, `getUser()` returns without a request.
  - A signed-in visit adds one `getUser()` from the `fra1` function to Supabase. React `cache` keeps it to one call per render.
  - S-01 decides how the deals feed is cached, knowing that the header reads the session.
- Sign-in and sign-up requests go from the browser straight to Supabase and add no Vercel invocation.
- The new `<Link>`s prefetch only `/login`, `/signup` and `/`.

## Migration Notes

- There is no schema change and no migration.
- **Rollback:** revert the commits; `vercel rollback` moves traffic only.
  - The dashboard settings survive a rollback. They are harmless without the forms, because sign-up is open at the API either way.
  - The phases revert independently. Reverting Phase 3 only removes the signed-in redirect, and reverting Phase 2 removes the forms and the header. Nothing in this plan can lock users out.

## References

- **Roadmap and PRD:**
  - roadmap S-01 and S-02: `context/foundation/roadmap.md:135-160`;
  - PRD `FR-001`: `context/foundation/prd.md:62-65`;
  - PRD `## Access Control`: `context/foundation/prd.md:104-108`.
- **Deferred records:**
  - `context/foundation/infrastructure.md:127-134` and `:150`;
  - `context/deployment/deploy-plan.md:66-68` and `:112-114`.
- **ui-init hand-offs:**
  - the input boundary: `context/changes/ui-init/plan.md:88`;
  - the focus indicator: `context/changes/ui-init/change.md:14-26`.
- **Next 16 docs** (`node_modules/next/dist/docs/01-app/`):
  - `02-guides/authentication.md:1033`, `:1121` and `:1352`;
  - `03-api-reference/03-file-conventions/proxy.md:249-255`;
  - `02-guides/server-actions.md:78-82`.
- **Supabase docs:**
  - `https://supabase.com/docs/guides/auth/passwords`
  - `https://supabase.com/docs/guides/auth/auth-smtp`
  - `https://supabase.com/docs/guides/auth/signout`
  - `https://supabase.com/docs/guides/auth/rate-limits`
  - `https://supabase.com/docs/guides/auth/debugging/error-codes`
  - the template `vercel/next.js` `examples/with-supabase`.
- **Lessons:** `context/foundation/lessons.md`, "Separate logic from I/O and from components before tests arrive".

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Form components in the design system

#### Automated

- [x] 1.1 `npm run lint` passes with zero warnings — 671743b
- [x] 1.2 `npm run format:check` passes (run `npm run format` first if needed) — 671743b
- [x] 1.3 `npm run build` succeeds with `/kitchen-sink` still prerendered as not found — 671743b
- [x] 1.4 `git status --porcelain src/components/ui` lists exactly `field.tsx`, `input.tsx`, `label.tsx` and `separator.tsx` as new — 671743b
- [x] 1.5 `git diff --quiet -- package.json package-lock.json components.json src/app/globals.css` exits 0 — 671743b
- [x] 1.6 `grep -rEn '(zinc|slate|gray|neutral|stone)-[0-9]|(bg|text|border)-(black|white)|#[0-9a-fA-F]{3,8}\b' src/app --include=*.tsx` prints nothing — 671743b

#### Manual

- [x] 1.7 With `npm run dev` started by Tomasz, screenshots of the kitchen sink's "Formularz" section at 1280 px and 375 px, saved to `context/changes/email-password-accounts/screenshots/`, show all four states with no horizontal scroll — 671743b
- [x] 1.8 Tab reaches each enabled input with a visible focus ring and skips the disabled one, and clicking a label focuses its input — 671743b
- [x] 1.9 DevTools contrast checks put the error text and the description text at 4.5:1 or more on the background — 671743b

### Phase 2: Sign-up, sign-in and sign-out

#### Automated

- [x] 2.1 `npm run lint` passes with zero warnings — b887b7c
- [x] 2.2 `npm run format:check` passes — b887b7c
- [x] 2.3 `npm run build` succeeds and its route list includes `/login` and `/signup` — b887b7c
- [x] 2.4 The palette-literal grep from Phase 1, run over `src/app` and `src/components/auth`, prints nothing — b887b7c
- [x] 2.5 `grep -rn '"use server"' src` prints nothing — b887b7c
- [x] 2.6 `grep -rn 'scope: "local"' src/components/auth` prints exactly one line — b887b7c
- [x] 2.7 `git diff --quiet -- package.json package-lock.json` exits 0 — b887b7c

#### Manual

- [x] 2.8 Signed out, `/` shows the placeholder with "Zaloguj się" and "Załóż konto" in the header, and each link opens its form — b887b7c
- [x] 2.9 Tomasz confirms the three dashboard steps were done in order, with no unconfirmed user left when "Confirm email" was switched off — b887b7c
- [x] 2.10 Signing up in dev with a fresh address Tomasz controls lands on `/`, whose header shows that address — b887b7c
- [x] 2.11 Signing up again with the same address shows "Konto z tym adresem już istnieje. Zaloguj się." and adds no user — b887b7c
- [x] 2.12 On `/signup`, the agent's 7-character password and mismatched repeat each show their field error, and DevTools → Network shows no request to `/auth/v1/signup` — b887b7c
- [x] 2.13 On `/login`, the agent's address with no account shows "Nieprawidłowy e-mail lub hasło.", the same message Tomasz gets for his own address with a wrong password — b887b7c
- [x] 2.14 Tomasz's SQL-editor count of the test user's rows in `auth.sessions` drops by exactly one after "Wyloguj się", while a second signed-in browser stays signed in — b887b7c
- [x] 2.15 After sign-out the page is `/`, its header shows "Zaloguj się" and "Załóż konto" without a manual reload, and Back does not bring back the signed-in header — b887b7c
- [x] 2.16 Screenshots at 1280 px and 375 px of `/login` (idle and with the error alert), `/signup` (idle and with field errors), and `/` signed out and signed in (Tomasz signs in inside the agent's browser window), saved to `context/changes/email-password-accounts/screenshots/`, show no horizontal scroll — b887b7c
- [x] 2.17 On each form, Tab moves through e-mail, password, repeat (sign-up only), submit and the link to the other form, each with a visible focus indicator — b887b7c

### Phase 3: Signed-in redirect in the proxy

#### Automated

- [x] 3.1 `npm run lint` passes with zero warnings — 189675c
- [x] 3.2 `npm run format:check` passes — 189675c
- [x] 3.3 `npm run build` succeeds — 189675c
- [x] 3.4 `test ! -e src/middleware.ts && grep -q "export async function proxy" src/proxy.ts` exits 0 — 189675c
- [x] 3.5 `grep -n "setAll(cookiesToSet, headers)" src/utils/supabase/session.ts` prints exactly one line — 189675c

#### Manual

- [x] 3.6 With `npm run build && npm run start` run by Tomasz, the agent's signed-out `curl -sI` returns 200 for `/`, `/login`, `/signup`, `/favicon.ico` and one `/_next/static/` asset linked from `/login` — 189675c
- [x] 3.7 The same `curl -sI` returns 404 for `/does-not-exist` and `/kitchen-sink` — 189675c
- [x] 3.8 Signed in, Tomasz opens `/login` and `/signup` from the address bar and lands on `/` — 189675c

### Phase 4: Production acceptance and records

#### Automated

- [x] 4.1 `grep -c "email-password-accounts" context/foundation/infrastructure.md context/deployment/deploy-plan.md` reports at least one match in each file — 539568e

#### Manual

- [x] 4.2 CI is green on `main` and the production deployment is `Ready` — 539568e
- [x] 4.3 The agent's signed-out `curl -sI` against `https://physical-games-deals.vercel.app` returns 200 for `/`, `/login` and `/signup`, and 404 for `/kitchen-sink` — 539568e
- [x] 4.4 Tomasz signs in to production with the demo account from a private window and lands on `/`, whose header shows the demo address — 539568e
- [x] 4.5 After more than an hour idle on production, Tomasz's first request, `/login` from the address bar, lands on `/` still signed in; the 307 carries `Set-Cookie` and `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, and a reload of `/` stays signed in — 539568e
- [x] 4.6 Authentication → Users lists only Tomasz's own account and the demo account — 539568e
