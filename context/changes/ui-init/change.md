---
change_id: ui-init
title: Ui init
status: implementing
created: 2026-09-24
updated: 2026-09-25
archived_at: null
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
