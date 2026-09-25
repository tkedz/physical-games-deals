---
date: 2026-09-24T16:08:37+02:00
researcher: tkedz
git_commit: 52a9face57068752debb288f2cf93065568080ed
branch: main
repository: 10x-physical-games-deals
topic: "Theming the existing shadcn/ui setup with a ready-made tweakcn preset"
tags: [research, ui, shadcn, tweakcn, tailwind-v4, design-tokens, next-font]
status: complete
last_updated: 2026-09-24
last_updated_by: tkedz
---

# Research: Theming the existing shadcn/ui setup with a ready-made tweakcn preset

**Date**: 2026-09-24T16:08:37+02:00 (Europe/Warsaw)
**Researcher**: tkedz
**Git Commit**: 52a9face57068752debb288f2cf93065568080ed
**Branch**: main
**Repository**: 10x-physical-games-deals

## Research Question

> opieramy fundament UI na shadcn. Znam już stronę tweakcn i skłaniałbym się do wybrania z niej jakiegoś gotowego szablonu

(The UI foundation is shadcn; the user knows tweakcn.com and leans towards picking one of its ready-made presets.)

Questions this document answers:

1. What UI foundation is already in the repository — the value source, the shared components, and which views read them?
2. What does a tweakcn preset contain, and what does installing one do to this repository?
3. Which product requirements constrain the choice of preset?
4. Which tweakcn presets survive those constraints?
5. What charges (file, line, user impact) should the plan start from?

## Summary

- **shadcn is already initialised; this change themes it and must not re-run `shadcn init`.** Commit `e5a2de7` (2026-09-18) added shadcn/ui with style `base-nova` on Base UI primitives ([components.json:3](../../../components.json#L3)). CLAUDE.md forbids a second design system on a repo that has one ([CLAUDE.md:91](../../../CLAUDE.md#L91)).
- **The value source exists, but no view reads it.** The tokens live in [src/app/globals.css](../../../src/app/globals.css) (`@theme inline` lines 7–49, `:root` 51–84, `.dark` 86–118). There is one shared component, [src/components/ui/button.tsx](../../../src/components/ui/button.tsx), and it is imported nowhere under `src/` (grep of `src/` for `components/ui`). The one view, [src/app/page.tsx](../../../src/app/page.tsx), is the create-next-app landing page. It uses literal `zinc-*`, `black`, `white` and hex classes, so a new preset has no visible effect on it.
- **Geist is loaded but not applied in the current build (confirmed in compiled CSS).** [globals.css:10](../../../src/app/globals.css#L10) defines `--font-sans: var(--font-sans)`, a self-reference, while [layout.tsx:5-8](../../../src/app/layout.tsx#L5-L8) exports `--font-geist-sans`. The production build emits `:root,:host{--font-sans:var(--font-sans)` and `html{font-family:var(--font-sans)}`. Under CSS Variables §2.3 a cycle is invalid at computed-value time, so `html` falls back to the browser default font. The CSS evidence is conclusive; the resulting typeface has not been screenshotted.
- **A tweakcn preset is a `registry:style` item.** `npx shadcn add https://tweakcn.com/r/themes/<name>.json` merges it into the existing `:root`, `.dark` and `@theme inline` blocks. It keeps the repo's radius multiplier scale and `--font-heading`. It also overwrites the font tokens, including the Geist Mono mapping, adds 8 noise mappings (listed below), and changes the bare `rounded` utility from 0.25rem to 0.5rem. The copy-paste route loses more: it drops two `@import`s, `--font-heading` and the 2xl–4xl radius scale.
- **Four constraints apply to this app specifically.** The layout forces dark mode ([layout.tsx:24](../../../src/app/layout.tsx#L24)). The destructive button renders its label in `text-destructive` ([button.tsx:18](../../../src/components/ui/button.tsx#L18)). The PRD requires the deals view to work on phone and desktop, a visible progress state and an explanatory empty state ([prd.md:55](../../foundation/prd.md#L55), [prd.md:87-88](../../foundation/prd.md#L87-L88)). The source posts are Polish, so the sans font needs Latin Extended glyphs.
- **Against those constraints, 14 of the 42 built-in presets pass the numeric filter below.** Recommended: **`amber-minimal`** with the motif **"price sticker"**. Its accent hue of 38° is amber; every other preset in the 14 is either grey or falls between 234° and 330°. Amber reads as a retail sale tag. Alternative: **`vercel`**, a neutral preset that keeps Geist and Geist Mono, which the layout already loads. The final pick is the user's.

## Detailed Findings

### 1. The existing foundation (audit)

**Value source — [src/app/globals.css](../../../src/app/globals.css)**

- Imports: `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css` ([globals.css:1-3](../../../src/app/globals.css#L1-L3)). `shadcn/tailwind.css` (`node_modules/shadcn/dist/tailwind.css`, 629 lines) adds accordion keyframes, `data-*` custom variants and scroll-fade utilities. It defines no colour tokens.
- Dark variant: `@custom-variant dark (&:is(.dark *))` ([globals.css:5](../../../src/app/globals.css#L5)).
- `@theme inline` ([globals.css:7-49](../../../src/app/globals.css#L7-L49)):
  - maps every `--color-*` role to a shadcn variable;
  - defines fonts `--font-sans: var(--font-sans)` (line 10, self-referential), `--font-mono: var(--font-geist-mono)` (line 11, correct) and `--font-heading: var(--font-sans)` (line 12);
  - defines a radius multiplier scale `--radius-sm` … `--radius-4xl`, derived from `--radius` (lines 42–48).
- Values: `:root` and `.dark` hold neutral `oklch` values ([globals.css:51-84](../../../src/app/globals.css#L51-L84), [86-118](../../../src/app/globals.css#L86-L118)). There are no shadow or tracking tokens.
- Base layer: `* { border-border outline-ring/50 }`, `body { bg-background text-foreground }`, `html { font-sans }` ([globals.css:120-130](../../../src/app/globals.css#L120-L130)).
- shadcn config: `baseColor: "neutral"`, `cssVariables: true`, `registries: {}` ([components.json:9-10](../../../components.json#L9-L10), [:24](../../../components.json#L24)).

**Shared components — [src/components/ui/](../../../src/components/ui/)**

- `button.tsx` is the only file. It has 6 variants and 8 sizes, built on `@base-ui/react/button` ([button.tsx:1](../../../src/components/ui/button.tsx#L1)).
- It imports `cn` from the `cn` package ([button.tsx:3](../../../src/components/ui/button.tsx#L3)). `src/lib/utils.ts` only re-exports it ([utils.ts:1](../../../src/lib/utils.ts#L1)). The `cn` package is shadcn's own: `node_modules/cn/package.json` names `github.com/shadcn-ui/cn`, licence MIT, and describes itself as a drop-in replacement for clsx + tailwind-merge. This is not an accidental dependency.
- Token use in the button: `bg-primary`, `text-primary-foreground` (line 10); `bg-destructive/10` with `text-destructive` for the label (line 18); `rounded-[min(var(--radius-md),10px)]` (line 24). The destructive label's legibility therefore depends on `--destructive` against `--background`.

**Views that read the tokens: none.**

- [page.tsx](../../../src/app/page.tsx) is the create-next-app landing page, which [roadmap.md:82](../../foundation/roadmap.md#L82) also confirms. Its colour literals:
  - `bg-zinc-50 dark:bg-black` (line 5);
  - `bg-white dark:bg-black` (line 6);
  - `text-black dark:text-zinc-50` (line 16);
  - `bg-black/[.06]` (line 18);
  - `text-zinc-600` (line 23);
  - `hover:bg-[#383838] dark:hover:bg-[#ccc]` (line 43);
  - `border-black/[.08] … dark:hover:bg-[#1a1a1a]` (line 58).
- It does not use `Button`.
- No product screen exists yet ([roadmap.md:82](../../foundation/roadmap.md#L82)).
- The 10x-ui guidance for this exact case: make the view read the existing tokens before choosing new values ([.claude/skills/10x-ui/SKILL.md:88](../../../.claude/skills/10x-ui/SKILL.md#L88), [:208](../../../.claude/skills/10x-ui/SKILL.md#L208)).

**Root layout — [src/app/layout.tsx](../../../src/app/layout.tsx)**

- Fonts: Geist and Geist Mono via `next/font/google`, with `variable: "--font-geist-sans"` / `"--font-geist-mono"` and `subsets: ["latin"]` ([layout.tsx:5-13](../../../src/app/layout.tsx#L5-L13)).
- `<html lang="en" className="… dark …">` ([layout.tsx:21-25](../../../src/app/layout.tsx#L21-L25)):
  - The `dark` class is hardcoded. Commit `9f20e57` "Force dark theme on the root layout" made this a deliberate change, but its message gives no reason.
  - There is no `next-themes` and no `prefers-color-scheme` handling. The `.dark` block matches `<html>` itself, so it overrides every `:root` colour value there. Under the current layout, the light colours are never rendered.
- `metadata` still reads "Create Next App" ([layout.tsx:15-18](../../../src/app/layout.tsx#L15-L18)).

### 2. The font-token cycle (confirmed)

- **Compiled output.** `.next/static/chunks/2h7d0jw_9bl3y.css` contains:
  - `:root,:host{--font-sans:var(--font-sans)`;
  - `html{font-family:var(--font-sans)}`;
  - `.font-sans{font-family:var(--font-sans)}`;
  - `--font-geist-sans:"Geist", "Geist Fallback"`, which is defined but never referenced by `--font-sans`.
- **Freshness.** That build dates from 2026-09-23 14:43. The last commits touching `globals.css`, `layout.tsx` or `components.json` are from 2026-09-18 (`9f20e57`, `64dd8fb`, `e5a2de7`), so it reflects the current source.
- **Why it fails.** The CSS spec says every custom property in a dependency cycle is invalid at computed-value time ([CSS Variables Level 1 §2.3](https://www.w3.org/TR/css-variables-1/#cycles)). `font-family: var(--font-sans)` on `html` therefore behaves as unset, and the page uses the browser's default font.
- **Why the value is there.** shadcn's font updater (`packages/shadcn/src/utils/updaters/update-fonts.ts` at shadcn 4.21.0, lines 45–49, as reported by the tweakcn worker) writes `--font-sans: var(--font-sans)` on purpose for Next.js. It pairs that with a layout whose `next/font` call uses `variable: "--font-sans"`. This repo's layout kept create-next-app's `--font-geist-sans`, so the pair is broken.
- **Fix options** (inference). Either one resolves the cycle:
  1. shadcn's pairing: set `variable: "--font-sans"` in the layout and keep `globals.css:10`.
  2. The pattern from the Next 16 docs: keep `--font-geist-sans` and map `--font-sans: var(--font-geist-sans)` ([node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md:733-772](../../../node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md)).

  Option 1 matches what future `shadcn add` font items will write.

### 3. What a tweakcn preset is and what installing it does

Evidence comes from the tweakcn worker. It read tweakcn `main` (last commit 2026-09-03) and shadcn 4.21.0 source. It also ran shadcn's own bundled `transformCssVars` / `transformCss` on a scratchpad copy of `globals.css` with the real `claude.json` and `supabase.json` presets. Nothing in the repository was written. I re-checked the supabase result against the current `globals.css` with `diff`.

**Contents** (served from `https://tweakcn.com/r/themes/<name>.json`; the route is `app/r/themes/[id]/route.ts`, the converter `utils/registry/themes.ts`):

- `type: "registry:style"`. The item has no `files`, `dependencies` or `fonts` keys.
- `cssVars.theme`: `font-sans`, `font-serif`, `font-mono`, `radius`, and `tracking-tighter` … `tracking-widest` as `calc()` offsets of `--tracking-normal`.
- `cssVars.light` / `cssVars.dark`:
  - all shadcn colour roles, plus `destructive-foreground`;
  - `chart-1..5` and 8 `sidebar-*` colours;
  - `radius` and the font stacks;
  - 6 shadow primitives and 8 pre-built `shadow-2xs` … `shadow-2xl`;
  - `letter-spacing`, `spacing`, and `tracking-normal`.
- `css`: `body { letter-spacing: var(--tracking-normal) }` in `@layer base`.
- Colours are converted to `oklch` on the registry route. The pre-built shadows are `hsl(… / a)`.
- Missing compared with what base-nova components consume: `--font-heading` and a 2xl–4xl radius scale. The CLI route keeps the repo's own versions of both. The copy-paste route loses them.

**`npx shadcn add <url>`**, from shadcn 4.21.0 `update-css-vars.ts` and `update-css.ts`, confirmed by the simulation:

- Replaces existing `:root` / `.dark` declarations in place and appends new ones. The CLI asks for confirmation first ("Existing CSS variables and components will be overwritten"); `--yes` skips the prompt.
- Writes `theme` entries into the existing `@theme inline`:
  - `--font-sans` and `--font-mono` become literal stacks, so the Geist Mono mapping at [globals.css:11](../../../src/app/globals.css#L11) is lost;
  - `--font-serif`, `--radius` and `tracking-*` are appended.
- Adds a `@theme inline` mapping for every new variable name. The repo's existing `--radius-sm..4xl` entries are skipped, so they survive.
- The noise mappings it adds are exactly these 8:
  - `--letter-spacing`
  - `--shadow-blur`
  - `--shadow-spread`
  - `--shadow-opacity`
  - `--shadow-offset-x`
  - `--shadow-offset-y`
  - `--color-shadow-color`
  - `--color-destructive-foreground`

  The first 7 generate utilities nothing uses, such as `shadow-blur`. The last one maps a token that `button.tsx` does not use.
- Side effect: the bare `rounded` utility changes from 0.25rem to 0.5rem, because `--radius` lands inside `@theme`.
- Adds `letter-spacing: var(--tracking-normal)` to the existing `body` rule.
- Grows `globals.css` from 130 to 198 lines for the claude preset.
- Leaves `components.json`, `layout.tsx` and `package.json` untouched. This is inferred from `commands/add.ts` and the item having no files or dependencies; the worker did not run the real command.
- `shadcn add` has `--dry-run` and `--diff` flags for previewing the change. Neither was run.

**Copy-paste route** (`utils/theme-style-generator.ts`) emits a whole stylesheet. Pasted over this repo's `globals.css`, it would:

- drop `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"`;
- drop `--font-heading` and `html { @apply font-sans }`;
- replace the multiplier radius scale with `calc(var(--radius) - 4px)`-style offsets for sm..xl only.

The CLI and copy-paste outputs differ from each other (tweakcn issue #70, open).

**Relevant open tweakcn issues** (none are specific to base-nova or Base UI; the worker's searches for both found nothing):

- #124 / PR #288: shadow colour modifiers such as `shadow-blue-500` have no effect.
- #283: installing a preset changes fonts, radius and spacing.
- #229: the `perpetuity` preset uses different fonts in light and dark mode.

**Licence.** tweakcn is Apache-2.0: the root `LICENSE` file, and GitHub reports `spdx_id: Apache-2.0`. There is no NOTICE file. The built-in presets live in the same repository (`utils/theme-presets.ts`). Themes saved by the community are stored in tweakcn's database, and their licensing is not stated anywhere the worker looked. The repo convention requires a line naming the source next to any external values ([CLAUDE.md:81](../../../CLAUDE.md#L81)).

### 4. Product constraints on the preset

From the PRD and roadmap (Polish sources, verified at the cited lines):

- **Responsive.** The deals view must be comfortable on phone and desktop ([prd.md:88](../../foundation/prd.md#L88); roadmap S-01 scope, [roadmap.md:139](../../foundation/roadmap.md#L139)).
- **Progress and empty states.**
  - Progress must be visible whenever the wait is longer than a moment, with no blank screen ([prd.md:87](../../foundation/prd.md#L87)).
  - The empty state must explain itself and show the last refresh time, so users can tell "no deals" apart from "broken processing" ([prd.md:55](../../foundation/prd.md#L55)).
  - Muted text (timestamps) and destructive text (errors) must therefore stay legible.
- **Not specified anywhere** in `context/foundation/*.md`: dark or light mode, brand or tone, density (list vs cards), an accessibility target, or cover art. The deal record has no image field ([prd.md:94-102](../../foundation/prd.md#L94-L102)). The product name is an open question ([prd.md:120](../../foundation/prd.md#L120)).
- **Language users see in the UI: undecided.** CLAUDE.md's English rule covers repository artifacts, not rendered copy. The PRD's worked example ("Silent Hill 2" with or without PS5) is in Polish ([prd.md:54](../../foundation/prd.md#L54)), and the layout says `lang="en"` ([layout.tsx:23](../../../src/app/layout.tsx#L23)).
- **Polish glyphs.** Next 16's `subsets` option only controls which subsets are preloaded ([font.md:146-148](../../../node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md)). The built Geist CSS (`.next/dev/static/chunks/[next]_internal_font_google_geist_a71539c9_module_css_1igg3k2._.single.css`) has 6 `@font-face` rules, including one with `unicode-range: U+100-2BA`. That range covers ą ć ę ł ń ś ź ż, so Polish characters work today. A new font works too, provided the family has `latin-ext` in Next's font data (`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`). If the UI copy is Polish, adding `"latin-ext"` to `subsets` preloads it (inference).
- **Where the roadmap stands.** The first real screens are S-01 (deals list) and S-02 (accounts; ready, no prerequisites) ([roadmap.md:57-65](../../foundation/roadmap.md#L57-L65)). Neither has been started.

### 5. Preset screening

**Method.**

- Parsed `defaultPresets` from tweakcn `utils/theme-presets.ts` (42 keys; file last changed 2025-11-08). Dark values were merged over light ones, as the registry route does.
- Computed WCAG 2 contrast ratios after converting hex, hsl and oklch to sRGB.
- Looked up each sans family in Next's `font-data.json`.

**Filter**, applied to the dark values because the layout forces `dark`. A preset had to pass all of these:

- `foreground/background` ≥ 4.5
- `muted-foreground/background` ≥ 4.5
- `primary-foreground/primary` ≥ 4.5
- `destructive/background` ≥ 4.5 (the button label is `text-destructive`)
- a red destructive hue (≤ 30° or ≥ 335°) in both modes
- a primary hue outside that red range, so a CTA cannot be confused with an error
- a sans family with `latin-ext`, or a system stack

**Result: 14 of 42 pass.**

| preset | primary hue | fg/bg | muted/bg | pfg/p | destr/bg | radius | sans / mono |
| --- | --- | --- | --- | --- | --- | --- | --- |
| amethyst-haze | 263 | 13.1 | 6.4 | 6.5 | 5.9 | 0.5rem | Geist / Fira Code |
| notebook | grey | 10.3 | 5.4 | 6.5 | 7.2 | 0.625rem | Architects Daughter / Fira Code |
| catppuccin | 267 | 12.1 | 7.9 | 8.1 | 7.6 | 0.35rem | Montserrat / Fira Code |
| cosmic-night | 251 | 14.9 | 7.5 | 7.2 | 6.1 | 0.5rem | Inter / JetBrains Mono |
| quantum-rose | 306 | 11.9 | 6.9 | 8.0 | 5.3 | 0.5rem | Quicksand / Space Mono |
| **amber-minimal** | **38** | **14.2** | **7.1** | **9.8** | **4.8** | **0.375rem** | **Inter / JetBrains Mono** |
| claymorphism | 234 | 13.9 | 6.8 | 5.7 | 4.6 | 1.25rem | Plus Jakarta Sans / Roboto Mono |
| pastel-dreams | 256 | 14.2 | 6.9 | 8.7 | 9.2 | 1.5rem | Open Sans / IBM Plex Mono |
| clean-slate | 234 | 14.5 | 7.0 | 6.0 | 4.7 | 0.5rem | Inter / JetBrains Mono |
| midnight-bloom | 247 | 13.4 | 6.7 | 4.9 | 4.5 | 0.5rem | Montserrat / Source Code Pro |
| candyland | 330 | 13.4 | 6.7 | 10.7 | 4.5 | 0.5rem | Poppins / Roboto Mono |
| **vercel** | **grey** | **21.0** | **8.5** | **21.0** | **6.9** | **0.5rem** | **Geist / Geist Mono** |
| mono | grey | 19.0 | 7.7 | 4.5 | 6.9 | 0rem | Geist Mono / Geist Mono |
| soft-pop | 234 | 21.0 | 13.1 | 7.0 | 7.6 | 1rem | DM Sans / Space Mono |

Source of the values: tweakcn `utils/theme-presets.ts` (https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts), Apache-2.0.

**Notable rejections among well-known presets.** These failed at least one check; the value shown is the one that failed.

| preset | failed check |
| --- | --- |
| claude | `pfg/p` 3.1; light destructive is near-black, not red |
| supabase | `destr/bg` 1.4, so the destructive label is effectively invisible in dark mode |
| nature | `destr/bg` 2.7 |
| retro-arcade | `destr/bg` 3.2; body `fg/bg` only 5.6 |
| doom-64, elegant-luxury | red primary; doom-64's dark destructive is not red |
| tangerine, solar-dusk, sunset-horizon | `pfg/p` 3.6 / 2.8 / 2.5 |
| twitter, cyberpunk, modern-minimal | `pfg/p` 3.0 / 3.5 / 3.7 |
| sage-garden | font Antic has no `latin-ext` |

**Judgement on the 14 (not numeric).**

- For dense deal rows with prices, drop the body fonts that hurt scanning:
  - `notebook` (handwriting);
  - `mono` (monospace body).
- Of the remaining 12, all but `amber-minimal` have a cool or pink accent (hue 234–330) or a grey one.
- **`amber-minimal` (recommended, motif "price sticker").**
  - Amber accent on neutral surfaces.
  - Inter, which has `latin-ext` in Next's font data.
  - Moderate 0.375rem radius.
  - Two caveats:
    1. `destr/bg` is 4.8, just above the AA threshold, so the gate must check it.
    2. The light-mode primary against the light background is 2.1. That is below the 3:1 non-text threshold, but it matters only if light mode ever becomes reachable.
- **`vercel` (alternative).** Monochrome. The smallest diff, because it keeps Geist and Geist Mono. There is no accent colour, so prices and discounts would need emphasis from type weight or size rather than colour.
- **`cosmic-night` / `clean-slate`.** Numerically solid Inter presets with a blue or indigo accent. Neither has a motif tied to deals.

## Charges for the plan

Three categories, per [CLAUDE.md:83](../../../CLAUDE.md#L83). Each charge has a file, a line and the effect on the user.

1. **Accidental architecture — font token cycle.** [globals.css:10](../../../src/app/globals.css#L10) against [layout.tsx:5-8](../../../src/app/layout.tsx#L5-L8). In the current build, text that takes its font from `html` or `.font-sans` renders in the browser's default font instead of Geist. That covers all of `/`, the only page. Any font a preset brings would go through the same broken wiring. Fix it together with the font the chosen preset brings.
2. **Missing tokens — the only view ignores the value source.** [page.tsx:5](../../../src/app/page.tsx#L5), 6, 16, 18, 23, 43 and 58 use literal `zinc`, `black`, `white` and hex colours. Installing any preset changes nothing the user sees on `/` until this page reads `bg-background`, `text-foreground`, `text-muted-foreground` and `Button`.
3. **Missing shared component — only `Button` exists and nothing renders it.** [src/components/ui/button.tsx](../../../src/components/ui/button.tsx) is not imported under `src/`. The PRD's progress state and explanatory empty state ([prd.md:55](../../foundation/prd.md#L55), [:87](../../foundation/prd.md#L87)) have no component to render them. Candidates to add, scoped to what the view needs: skeleton, card, badge.
4. **Accidental architecture — dark mode forced with unverified light values.** [layout.tsx:24](../../../src/app/layout.tsx#L24) hardcodes `dark`, so every preset's light block is dead code and untested. Users whose system is set to light mode get dark mode regardless. Whether that is intended is a product decision; commit `9f20e57` records the change but not the reason.
5. **Accidental architecture — scaffold identity.** [layout.tsx:15-18](../../../src/app/layout.tsx#L15-L18) and [:23](../../../src/app/layout.tsx#L23). The browser tab reads "Create Next App", and `lang="en"` may not match the UI language (not yet decided). Adjacent to theming; include it only if the plan scopes it in.

## Code References

- `components.json:3` — `"style": "base-nova"`
- `components.json:9-10` — `baseColor: neutral`, `cssVariables: true`
- `src/app/globals.css:1-3` — imports that the copy-paste route would drop
- `src/app/globals.css:10-12` — font tokens (`--font-sans` cycle, Geist Mono mapping, `--font-heading`)
- `src/app/globals.css:42-48` — radius multiplier scale, preserved by `shadcn add`
- `src/app/globals.css:51-118` — `:root` / `.dark` value blocks a preset replaces
- `src/app/layout.tsx:5-13` — `next/font` variables `--font-geist-sans` / `--font-geist-mono`
- `src/app/layout.tsx:23-24` — `lang="en"`, forced `dark`
- `src/app/page.tsx:5-58` — literal colour classes (create-next-app page)
- `src/components/ui/button.tsx:10,18,24` — `bg-primary`, `text-destructive` label, `--radius-md` use
- `src/lib/utils.ts:1` — re-export of shadcn's `cn` package
- `.next/static/chunks/2h7d0jw_9bl3y.css` — compiled evidence of the font cycle (build 2026-09-23)
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md:146-148, 733-772` — subsets semantics; Tailwind variable pattern
- `.prettierignore:19-20` — `*.md` and `context/` are outside `format:check`

## Architecture Insights

- **The design-system contract already has both halves.** Tokens are in one source (`globals.css`) and components live in the repo (`src/components/ui/`). The gap is adoption, not infrastructure: nothing reads the halves yet.
- **`globals.css` is also Prettier's `tailwindStylesheet`** ([.prettierrc:3](../../../.prettierrc#L3)). Changing that file may therefore change how Prettier sorts classes in `.tsx` files (inference). Run `npm run format:check` after the install.
- **There is no screenshot test and no test runner** (CLAUDE.md, Verification). The visual gate is therefore a kitchen-sink render screenshotted by hand, not a baseline test ([CLAUDE.md:84](../../../CLAUDE.md#L84)).

## Historical Context (from prior changes)

- Commit `e5a2de7` (2026-09-18) added shadcn/ui on Base UI with Tailwind 4, keeping the CLI as a devDependency. It was done outside the `context/changes/` chain, so no plan or research records why Base UI was chosen over Radix.
- Commit `9f20e57` (2026-09-18) forced the dark theme. The message states the change, not the reason.
- `context/changes/bootstrap-verification/verification.md` covers only the create-next-app scaffold (2026-09-17) and does not mention shadcn.
- `context/archive/` contains only `README.md`, so there are no archived UI changes.

## Related Research

- Not applicable. There is no earlier UI research under `context/changes/**` or `context/archive/**`.

## Open Questions

These are decisions for the user or the plan, not evidence gaps.

1. **Which preset?** Recommended: `amber-minimal` (motif "price sticker"). Alternatives: `vercel` (neutral, keeps Geist), or another row from the table in §5.
2. **Keep forced dark or follow the system?** This decides whether the preset's light block must also pass the gate. `amber-minimal`'s light primary against the light background is 2.1.
3. **What language will users see in the UI?** It affects `lang`, the preloaded `subsets`, and the copy in the kitchen sink.
4. **Install route.** Recommended: `npx shadcn add https://tweakcn.com/r/themes/<name>.json --dry-run` / `--diff` first. Then run it, and afterwards:
   - prune the 8 noise mappings;
   - restore the mono font mapping;
   - put a source comment naming the preset URL and Apache-2.0 next to the values.

   This keeps the `@import`s, `--font-heading` and the radius scale that the copy-paste route drops. The alternative is to hand-map the values into the existing blocks.
5. **Where does the kitchen sink live?** Either replace `/` with a token-reading placeholder plus a separate kitchen-sink route, or use a single page. If the route exists in production builds, it needs a guard.
