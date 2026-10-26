---
change_id: ui-init
title: Ui init
status: archived
created: 2026-09-24
updated: 2026-10-26
archived_at: 2026-10-26T12:50:37Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Deferred: focus-indicator contrast on outline and destructive buttons (found in Phase 3)

- **Effect on the user.** A keyboard user sees a focus indicator on every button. On the outline and destructive variants, though, it is faint against the black background. It falls below WCAG 2 non-text contrast (3:1), while the other variants clear it.
- **Measured** in the browser on `/kitchen-sink` (dark theme, composited in sRGB):

  | Variant | Focus border | 3 px ring | Against the background |
  | --- | --- | --- | --- |
  | default, secondary, ghost, link | `ring` | `ring` at 50% | 8.42 (border) |
  | outline | stays `--input` | `ring` at 50% | 1.66 (border), 2.69 (ring) |
  | destructive | `destructive` at 40% | `destructive` at 40% | 1.84 |

- **Cause.** Upstream `src/components/ui/button.tsx` (shadcn `base-nova`): the outline variant's `dark:border-input` wins over the base `focus-visible:border-ring`, and the destructive variant sets its own `focus-visible:border-destructive/40` and `dark:focus-visible:ring-destructive/40`. The plan keeps `button.tsx` unchanged, and the Key Discoveries contrast table assumed `focus-visible:border-ring` on every variant.
- **Status.** Deferred by Tomasz on 2026-09-25 for `/10x-impl-review` to triage. A candidate fix is a focus-border override on those two variants in `button.tsx`.

### Kitchen-sink visibility after the push (plan checks 3.9 and 3.10, 2026-09-25)

- **PR preview (3.9): `/kitchen-sink` returned 404** (verified by Tomasz). The Vercel project does not expose system environment variables to the build, so `VERCEL_ENV=preview` never reaches the guard, and it fails closed as designed. Tomasz is leaving that setting off for now, so the kitchen sink is visible only under `npm run dev`. Turning on "Automatically expose System Environment Variables" in the Vercel project would make previews render it.
- **Production (3.10):** after `f95ae68` reached `main`, `https://physical-games-deals.vercel.app/kitchen-sink` returned 404, and `/` returned 200 with the new placeholder. Verified by Tomasz and by `curl`.
