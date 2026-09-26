---
change_id: email-password-accounts
title: Email password accounts
status: implementing
created: 2026-09-25
updated: 2026-09-26
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-09-26, Tomasz — password rule beyond the plan.** During the Phase 2 dashboard steps the hosted project also got required characters: lowercase, uppercase, a digit and a symbol (`lower_upper_letters_digits_symbols`). `signUpSchema` mirrors Supabase's exact character sets (`hasRequiredCharacters`), and `supabase/config.toml` sets the same `password_requirements`. The password description drops "do 72 znaków" and names the minimum and the character rule instead; the 72-character limit stays as a validation guard with its own error.
