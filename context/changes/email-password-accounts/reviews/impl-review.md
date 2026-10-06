<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: E-mail and Password Accounts

- **Plan**: context/changes/email-password-accounts/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Triage (2026-10-06)

- **Fixed**: F1, F2, F3, F4, F5 (5). Each fix took the single option offered in its finding.
- **After the fixes**:
  - `npm run lint`, `npm run format:check` and `npm run build` all exit 0. `/` still builds as dynamic.
  - The `scope: "local"` and `setAll(cookiesToSet, headers)` greps each print one line, and the palette grep prints nothing.
- **Not yet exercised in a browser**:
  - F1's failure path: block `/auth/v1/logout` in DevTools, click "Wyloguj się", and expect to land on `/` signed out.
  - F4's skeleton at 375 px with a signed-in session.
  - F2 touches `session.ts`, so repeat the session-survival test (`infrastructure.md` Setup item 6) after the next production deploy.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Evidence

- **Range reviewed**: 671743b..e1f2a19. Every file the plan names changed in that range, and no source file outside it did. Plan edits during implementation touched only `## Progress`.
- **Plan drift**: none. The one departure, the password character-class rule, is recorded in change.md in the commit that made it (b887b7c), and the code matches that note. The extras are small and serve planned items: the `validateCredentials()` helper, an always-present `aria-describedby` on the sign-up password, `role="status"` on the no-session notice, and the preview-accounts sentence in `infrastructure.md` Operations, whose wording the plan's Intent supplies.
- **Guardrails**: no `"use server"`, no route handler, no `/auth/callback`, no migration, no `getClaims`, no `next` parameter, no outline or destructive variant in the header. `input.tsx` is unedited, and `package.json` is unchanged across the change.
- **Automated checks**, run 2026-10-06 at HEAD (4a1b32e) on Node 24.21.0:

  | Check | Result |
  | --- | --- |
  | `npm run lint` | exit 0 |
  | `npm run format:check` | exit 0 |
  | `npm run build` | exit 0. Routes `ƒ /`, `○ /login`, `○ /signup`, `○ /kitchen-sink`, plus the proxy |
  | Palette-literal grep over `src/app` and `src/components/auth` | no output |
  | `"use server"` grep | no output |
  | `scope: "local"` grep | exactly one line: `sign-out-button.tsx:26` |
  | `git diff --quiet` checks in 1.5 and 2.7 | exit 0 |
  | 3.4 (`proxy`, no `middleware.ts`) | exit 0 |
  | 3.5 (`setAll` grep) | one line: `session.ts:33` |
  | 4.1 | `infrastructure.md`: 3 matches, `deploy-plan.md`: 2 |

- **Manual checks**: all 32 are ticked.
  - The 2 + 12 planned screenshots are in `screenshots/`, plus one focus screenshot.
  - The production idle test (4.5) is recorded with its observed 307, `Set-Cookie` and `Cache-Control` in `infrastructure.md` Setup item 6.
  - The checks only Tomasz could run (dashboard order, `auth.sessions` counts, demo account) have no artefact in the diff. That is expected; it does not suggest rubber-stamping.
- **Installed versions checked**: `@supabase/ssr` 0.12.7, `@supabase/auth-js` 2.116.0, `next` 16.3.5, `zod` 4.6.5.
- **Left open in change.md for this review**:
  - (a) `setAll` running twice: see F2.
  - (b) the 72-byte limit: see F3.

## Findings

### F1 — A failed sign-out has already signed the browser out

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/sign-out-button.tsx:13-14, :30-33 (premise in plan.md:73 and :155)
- **Detail**: The plan and the component comment say that a failed `signOut()` keeps the session in supabase-js. That is not true in the installed auth-js 2.116.0.
  - In `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3433-3445`, when `/logout` fails with anything other than 401/403/404 or session-missing (a network error or a 5xx, for example), `_signOut` runs `removeCurrentSession()` before it returns `{ error }`.
  - So the cookies are already gone. Yet the button shows "Nie udało się wylogować. Spróbuj ponownie.", and the header keeps showing the e-mail, because nothing refreshes.
  - A second click finds no session, makes no server call, returns `error: null` and navigates. The user ends up signed out locally while the `auth.sessions` row was never revoked.
  - The session survives only when loading it fails (`:3429-3431`).
- **Fix**: On error, check `(await supabase.auth.getSession()).data.session`. If it is `null`, finish as on success (`push("/")` + `refresh()`). Otherwise keep the current message. Correct the component comment, and add a dated change.md note that the plan's premise was wrong (lessons.md, "Record every departure").
  - Strength: The UI then reports what supabase-js actually did, and the header can no longer contradict the cookies.
  - Tradeoff: When `/logout` itself failed, the user sees a normal sign-out, although the server session row lives on until its refresh token is used or expires. The plan's "revokes the current session" holds only on the success path.
  - Confidence: HIGH. The branch is in the installed source, and `getSession()` reads local storage only.
  - Blind spot: The failure path has not been exercised in a browser. It needs DevTools request blocking on `/auth/v1/logout`.
- **Decision**: FIXED — `hasStoredSession()` in `sign-out-button.tsx`, comment corrected, departure noted in change.md (2026-10-06)

### F2 — A second `setAll` drops the cache headers from the pass-through response

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/utils/supabase/session.ts:37-48
- **Detail**: This answers open item (a) in change.md. `@supabase/ssr` passes the cache headers only on the first `setAll` call and `{}` after it (`node_modules/@supabase/ssr/dist/main/cookies.js:323-331`). It can call `setAll` more than once per request: a PKCE slot or index removal is its own batch (`cookies.js:411-423`), and `SIGNED_OUT` is another.
  - This happens when the proxy tears down a dead session for an account whose PKCE cookies remain from `signUp`.
  - Each call rebuilds `supabaseResponse` and sets only that call's `headers`. The returned `response` therefore carries the cookie-clearing `Set-Cookie` without `Cache-Control: private, no-store`.
  - Cookies are not lost: the last batch re-emits every accumulated removal.
  - `redirectTo()` is unaffected, because it applies the merged `cacheHeaders`.
  - The exposure is small, since the cleared cookies carry no tokens. But it breaks the invariant the closed risk-register row protects (`infrastructure.md`, "session cookies leak across users via CDN caching").
  - The change.md note "in practice `setAll` runs once per request" is inaccurate.
- **Fix**: After `cacheHeaders = { ...cacheHeaders, ...headers }`, apply `cacheHeaders`, not `headers`, to the rebuilt `supabaseResponse`. Then correct the change.md note.
- **Decision**: FIXED — `setAll` applies the merged `cacheHeaders`; superseding note in change.md (2026-10-06)

### F3 — The 72-character limit counts characters, Supabase counts bytes

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth/credentials.ts:53
- **Detail**: This answers open item (b) in change.md, which was accepted there as an edge case. GoTrue's `MaxPasswordLength = 72` is checked with Go's `len()`, which counts bytes. zod's `.max(72)` counts UTF-16 code units.
  - A password of at most 72 characters but more than 72 bytes passes the form and fails at Supabase. Each Polish letter takes 2 bytes.
  - `authErrorMessage` has no case for that failure, so the user gets "Coś poszło nie tak. Spróbuj ponownie.", which invites a retry that fails the same way.
  - `.min(8)` is safe as it is: the form is the stricter side for the minimum.
  - The character sets in `hasRequiredCharacters` match the Supabase CLI's `lower_upper_letters_digits_symbols` value. No finding there.
- **Fix**: Replace `.max(72)` with `.refine((p) => new TextEncoder().encode(p).length <= 72, …)`, reword the message so it does not promise 72 characters, and update the change.md note.
- **Decision**: FIXED — byte-length `refine` with a reworded message; note in change.md (2026-10-06)

### F4 — The header's session read holds back streaming for signed-in users

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/layout.tsx:15
- **Detail**: `await getCurrentUser()` at the top of the layout holds `{children}` back, `(deals)/loading.tsx` included, until the Auth round trip returns.
  - Next's own guidance (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1362-1366`, "Auth and streaming") says to move that await into a nested Server Component inside `<Suspense>`.
  - Visitors pay nothing: there is no session cookie, so there is no call. A signed-in render pays one `getUser()` on top of the proxy's.
  - The plan accepted that `/` becomes dynamic and left caching to S-01. The loading state S-01 added makes this interaction visible.
  - React `cache` deduplicates nothing today, because the layout is the only caller.
- **Fix**: Move the auth area of the header (the e-mail and `SignOutButton`, or the two links) into an async `HeaderAuth` component wrapped in `<Suspense>`, with a fallback of fixed size.
  - Strength: The page shell and `loading.tsx` stream at once, as the Next 16 docs recommend for session-dependent shell UI.
  - Tradeoff: The auth area pops in after the shell, so it needs a fallback that does not shift the header. That is one more component.
  - Confidence: MED. The pattern is documented, but the gain depends on Supabase round-trip latency from `fra1`, which was not measured.
  - Blind spot: No timing of a signed-in `/` render exists to show that the delay is perceptible.
- **Decision**: FIXED — local `HeaderAuth` inside `<Suspense>` (`Skeleton h-8 w-48`); `(deals)/loading.tsx` comment updated; note in change.md (2026-10-06)

### F5 — `getCurrentUser()` discards the Auth error silently

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/auth/current-user.ts:20-24
- **Detail**: The `error` from `getUser()` is dropped. During an Auth outage (`AuthRetryableFetchError`), a signed-in user is rendered as signed out, and nothing reaches the server log.
  - `src/lib/deals/queries.ts:104` and `:109` set the repo's pattern: log the error code, never the message.
- **Fix**: When `error` is set and is not `isAuthSessionMissingError(error)`, `console.error` its `code ?? status` (never `message`), in the style of `queries.ts`.
- **Decision**: FIXED — `getCurrentUser()` logs the code of any error other than session-missing (2026-10-06)
