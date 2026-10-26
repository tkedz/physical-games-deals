---
change_id: email-password-accounts
title: Email password accounts
status: archived
created: 2026-09-25
updated: 2026-10-26
archived_at: 2026-10-26T12:50:38Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-09-26, Tomasz — password rule beyond the plan.** During the Phase 2 dashboard steps the hosted project also got required characters: lowercase, uppercase, a digit and a symbol (`lower_upper_letters_digits_symbols`). `signUpSchema` mirrors Supabase's exact character sets (`hasRequiredCharacters`), and `supabase/config.toml` sets the same `password_requirements`. The password description drops "do 72 znaków" and names the minimum and the character rule instead; the 72-character limit stays as a validation guard with its own error.
- **Open for impl-review — `setAll` rebuilds the response on every call.** `src/utils/supabase/session.ts` replaces `supabaseResponse` with a fresh `NextResponse.next({ request })` each time `setAll` runs. If `@supabase/ssr` called it twice in one request, the first batch's cookies would be lost from the pass-through response (`redirectTo()` keeps the merged cache headers, not the lost cookies). The pattern predates this change and comes from the Supabase SSR guide; in practice `setAll` runs once per request. Not changed here.
- **Open for impl-review — the 72 limit is counted differently on each side.** zod's `.max(72)` counts UTF-16 characters; Supabase (bcrypt, Go `len`) counts bytes. A password within 72 characters but over 72 bytes — possible with Polish letters, which take 2 bytes each — passes the form and comes back as `validation_failed`, which shows the generic error. Accepted as an edge case; the plan specified characters.
- **2026-10-06, impl-review F1 — a failed sign-out is not a kept session.** The plan states in Key Discoveries (the `signOut()` bullet) and in Critical Implementation Details that a failed `signOut()` keeps the session in supabase-js. auth-js 2.116.0 (`_signOut`) deletes the local session before it returns any error other than 401/403/404. `SignOutButton` now checks `getSession()` after an error and finishes as on success when no session is stored; it reports the failure only while a session remains. Decision: `reviews/impl-review.md`, F1.
- **2026-10-06, impl-review F2 — `setAll` can run more than once per request.** The note above ("in practice `setAll` runs once per request") does not hold: when the proxy tears down a dead session, @supabase/ssr 0.12.7 removes PKCE cookies and signs out in separate `setAll` batches, and passes the cache headers with the first one only. Cookies were not lost, but the rebuilt pass-through response went out without the cache headers. `setAll` now applies the merged `cacheHeaders` to every rebuilt response. Decision: `reviews/impl-review.md`, F2.
- **2026-10-06, impl-review F3 — the 72 limit now counts bytes.** The edge case accepted above is closed: `signUpSchema` checks the UTF-8 byte length against 72, as Supabase does, instead of zod's `.max(72)` on characters. The message changes from the plan's "Hasło może mieć najwyżej 72 znaki." to "Hasło jest za długie: może mieć najwyżej 72 znaki, a polskie litery liczą się podwójnie." Decision: `reviews/impl-review.md`, F3.
- **2026-10-06, impl-review F4 — the header reads the session inside Suspense.** `(app)/layout.tsx` no longer awaits `getCurrentUser()` at the top; a local `HeaderAuth` does, inside `<Suspense>` with a button-height `Skeleton` fallback, so `(deals)/loading.tsx` and the page stream without waiting for Auth. That file's comment, which described the old blocking, is updated with it. Decision: `reviews/impl-review.md`, F4.
