---
change_id: email-password-accounts
title: Email password accounts
status: implemented
created: 2026-09-25
updated: 2026-09-26
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-09-26, Tomasz — password rule beyond the plan.** During the Phase 2 dashboard steps the hosted project also got required characters: lowercase, uppercase, a digit and a symbol (`lower_upper_letters_digits_symbols`). `signUpSchema` mirrors Supabase's exact character sets (`hasRequiredCharacters`), and `supabase/config.toml` sets the same `password_requirements`. The password description drops "do 72 znaków" and names the minimum and the character rule instead; the 72-character limit stays as a validation guard with its own error.
- **Open for impl-review — `setAll` rebuilds the response on every call.** `src/utils/supabase/session.ts` replaces `supabaseResponse` with a fresh `NextResponse.next({ request })` each time `setAll` runs. If `@supabase/ssr` called it twice in one request, the first batch's cookies would be lost from the pass-through response (`redirectTo()` keeps the merged cache headers, not the lost cookies). The pattern predates this change and comes from the Supabase SSR guide; in practice `setAll` runs once per request. Not changed here.
- **Open for impl-review — the 72 limit is counted differently on each side.** zod's `.max(72)` counts UTF-16 characters; Supabase (bcrypt, Go `len`) counts bytes. A password within 72 characters but over 72 bytes — possible with Polish letters, which take 2 bytes each — passes the form and comes back as `validation_failed`, which shows the generic error. Accepted as an edge case; the plan specified characters.
