# UI Foundation (ui-init) Implementation Plan

## Overview

Theme the existing shadcn/ui setup (style `base-nova`) with tweakcn's built-in `vercel` preset. Its values are mapped by hand into the token source that already exists (`src/app/globals.css`). The same change fixes the broken font-token wiring, moves the only view (`/`) onto tokens with a Polish placeholder, and adds the shared components that the PRD's states need. It closes with a kitchen-sink page that renders every named state. That page is visible in `next dev` and on PR previews and returns 404 in production.

The scope is one view plus global tokens. No product screens are built here: S-01 and S-02 build their own views and audit them afterwards.

## Current State Analysis

- **Design system.** shadcn/ui was initialised on 2026-09-18 (`e5a2de7`) with style `base-nova` on Base UI (`components.json:3`). Tokens live in `src/app/globals.css`:
  - `@theme inline` at lines 7–49;
  - neutral `:root` at lines 51–84;
  - neutral `.dark` at lines 86–118.

  The only component is `src/components/ui/button.tsx`, and nothing imports it.
- **The only view ignores the tokens.** `src/app/page.tsx` is the create-next-app landing page. It uses literal `zinc-*`, `black`, `white` and hex classes (lines 5, 6, 16, 18, 23, 43, 58), so no token change is visible there.
- **Font-token cycle.** `globals.css:10` declares `--font-sans: var(--font-sans)`, but `layout.tsx:5-8` exports `--font-geist-sans`. The chain never resolves, and `html` falls back to the browser default font (compiled-CSS evidence in research §2).
- **Forced dark.** `layout.tsx:24` hardcodes `dark` (commit `9f20e57`). The light block is never rendered. This stays by decision.
- **Scaffold identity.**
  - `metadata` reads "Create Next App" (`layout.tsx:15-18`) and the document says `lang="en"` (`layout.tsx:23`).
  - `public/` holds five create-next-app SVGs. Only `next.svg` and `vercel.svg` are referenced, both by `page.tsx`.
- **Deployment.**
  - Pull requests deploy to a Vercel preview and pushes to `main` deploy to production (`.github/workflows/ci.yml:87-109`).
  - The `verify` job runs `npm run lint` and `npm run format:check`.
- **Verification tooling.** There is no test runner and no screenshot tool (CLAUDE.md, Verification).

## Desired End State

- **Tokens.** `:root` and `.dark` in `globals.css` hold the `vercel` preset's light and dark values, and `--radius` is `0.5rem`. A comment names the source. No variable is added or removed.
- **Fonts.** Body text renders in Geist and monospace in Geist Mono. The font chain resolves, and no `--font-geist-*` name remains anywhere.
- **Document.** `<html lang="pl">`, and the browser tab reads "Okazje na gry pudełkowe".
- **`/`.** A Polish placeholder built only from semantic tokens and repo components. No palette literal, hex or arbitrary colour remains in `src/app/**/*.tsx`.
- **Components.** `src/components/ui/` holds `card`, `badge`, `skeleton`, `alert` and `empty` next to `button`.
- **Kitchen sink.** `/kitchen-sink` renders all seven states (default, hover, focus, disabled, error, empty, loading) in `next dev`. It also renders on PR previews when Vercel exposes system environment variables. It returns 404 in every production build.
- **Gates.** `npm run lint`, `npm run format:check` and `npm run build` pass. Screenshots exist at 1280 px and at 375 px. The contrast pairs below hold.

### Key Discoveries:

- **`shadcn add <tweakcn-url>` writes the right v4 shape, but does far more than set colours.** A real write on a scratch copy of the project (shadcn 4.21.0, the latest release, 2026-09-25) confirms research §3:
  - it replaces the `:root` and `.dark` values in place;
  - it turns `--font-sans` and `--font-mono` in `@theme inline` into literal stacks, which drops the `next/font` wiring and its metric-matched `"Geist Fallback"`;
  - it moves `--radius` into `@theme inline`;
  - it appends about twenty mappings and tokens nothing in scope consumes: the tracking scale, shadow tokens, self-referencing `--spacing`, `--letter-spacing` and `--tracking-normal`, `--color-shadow-color` and `--color-destructive-foreground`;
  - it appends font, shadow, spacing and tracking values to both blocks, adds `--radius` to `.dark`, and adds `letter-spacing` to `body`.

  Mapping the 63 values in place reaches the same colours without any of that.
- **The `--dry-run` preview of that command is wrong.** `--dry-run --diff globals.css` shows a nested, Tailwind v3-shaped copy inside `@layer base` that the real write never produces. The dry-run planner calls the CSS-vars transformer as `Ia$1(d, e.cssVars, t, { overwriteCssVars })` (`node_modules/shadcn/dist/index.js`) without `tailwindVersion`, and the transformer (`on`, exported as `Ia` from `chunk-B2MD6U5O.js`) defaults it to `"v3"`. The real write passes the detected `v4` (`components.json` has `"config": ""`).
- **The font self-reference is harmless once the layout pairs it.**
  - Tailwind emits `:root,:host{--font-sans:var(--font-sans)}` inside `@layer theme` (`.next/static/chunks/2h7d0jw_9bl3y.css`).
  - `next/font` emits its variable class unlayered, at top level (`.geist_a71539c9-module__T19VSG__variable{--font-geist-sans:…}` in the same file).

  A `next/font` call with `variable: "--font-sans"` therefore overrides the layered self-reference on `<html>`, whatever the stylesheet order. This is shadcn's own pairing.
- **The components are clean creates.** `card`, `badge`, `skeleton`, `alert` and `empty` all resolve for `base-nova` (dry-run, 2026-09-25). They are pure file creates with no new npm dependency and no CSS change, and `button.tsx` is untouched. All of them import `cn` from the `cn` package, like `button.tsx`. `alert` has a `destructive` variant: `text-destructive` on `bg-card`, description at `/90`.
- **Contrast of the `vercel` dark values** (computed from the pinned JSON: OKLCH to sRGB, clipped; WCAG 2 relative luminance; alpha composited in gamma-encoded sRGB). Every text pair clears 4.5, so no token deviates from the preset:

  | Pair | Where it shows | Ratio |
  | --- | --- | --- |
  | `foreground` / `background` | body text | 21.00 |
  | `muted-foreground` / `background` | timestamps, descriptions | 8.46 |
  | `muted-foreground` / `card` | `CardDescription` | 8.02 |
  | `primary-foreground` / `primary` | default `Button`, `Badge` | 21.00 |
  | `destructive` / `background` | destructive text | 6.90 |
  | `destructive` / `card` | `Alert` destructive title | 6.54 |
  | `destructive` at 90% / `card` | `AlertDescription` | 5.44 |
  | `destructive` / `destructive` at 20% over `background` | destructive `Button` and `Badge` label | 5.58 |
  | `destructive` / `destructive` at 30% over `background` | destructive `Button` hover | 4.64 |
  | `ring` / `background` | focus border (`focus-visible:border-ring`) | 8.46 |

- **`NODE_ENV` cannot tell a preview from production.** It is `production` for every command other than `next dev` (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, "Good to know"). `VERCEL_ENV` is set at build time and at runtime only when the Vercel project exposes system environment variables, so a guard written as `VERCEL_ENV === "production"` fails open. A page that calls `notFound()` without streaming becomes a static 404 (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md:13`). `next.config.ts` does not enable `cacheComponents`.
- **Polish glyphs.** Geist and Geist Mono both list `latin-ext` in Next's font data. `subsets` only controls preloading (`font.md:146-148`).

## What We're NOT Doing

- No `shadcn add <theme-url>` and no `shadcn init`. The theme is hand-mapped: the CLI would also rewrite the font wiring and add some twenty tokens and mappings that would each need pruning (Key Discoveries).
- No light mode.
  - `dark` stays forced. The light block receives the preset's light values but is neither rendered nor gated.
  - Known gap if light mode is ever turned on: light `--destructive` on `--background` is 3.73.
- No theme toggle and no `next-themes`.
- No preset tokens beyond the roles the blocks already hold:
  - no shadow tokens;
  - no tracking scale and no `letter-spacing`, since the preset's values are `0em` anyway;
  - no `--destructive-foreground`;
  - no `--font-serif`.
- No deals view and no deal-row layout (S-01), and no auth screens (S-02).
- No favicon or brand mark, which wait for the product name (PRD open question 1).
- No screenshot-test tooling: the gate is manual screenshots (CLAUDE.md, lesson boundaries).
- No form controls. The low input-boundary contrast of the dark theme (`--input` on `--background`, 1.66) belongs to S-02's audit.
- No `spinner`: a skeleton with a visible label covers loading.
- No `DESIGN.md`. The source comment in `globals.css` and this plan carry the rationale.

## Implementation Approach

Follow the 10x-ui order: value source first, then shared components and the one view, then states and the gate.

**Value source.** The pinned registry JSON is the source of record, so the mapping needs no network and matches the contrast table above. Map by replacing values in place in the existing `:root` and `.dark` blocks.

**Fonts.** Use shadcn's pairing. The layout's `next/font` calls take `variable: "--font-sans"` and `"--font-mono"`, and `globals.css` keeps referencing those names.

**View.** `/` is rebuilt from semantic tokens and repo components only.

**Gate and guard.** The kitchen sink is the visual gate. Its visibility is decided by a pure predicate (`context/foundation/lessons.md`: logic separate from I/O), so the fail-closed rule stays readable and a future test runner can cover it.

**Phase checks.** Each phase ends with lint, format and build, plus one look at the rendered result.

**Swapping the theme later.** Repeat Phase 1:

1. Pin the new registry JSON in a change folder.
2. Re-map the same keys into `:root` and `.dark`, keeping the skip list.
3. Update the source comment.
4. Re-run the kitchen sink and the contrast table.

## Critical Implementation Details

### The font self-reference must stay

Keep `--font-sans: var(--font-sans)` in `@theme inline`. It works only because the unlayered `next/font` class on `<html>` overrides Tailwind's layered self-reference. If either side drifts, the page silently falls back to the browser default font with no build error or warning. The drift can come from renaming the layout's `variable`, or from "fixing" the self-reference in the CSS.

### Do not judge CSS changes by the shadcn dry-run

For any item that carries `cssVars`, the `--dry-run` and `--diff` preview in shadcn 4.21.0 shows a shape the real write does not produce. To see what such an item really does to `globals.css`, run the real command on a branch and read `git diff`, or run it against a scratch copy. On Windows, `--diff` resolves only the basename or a backslash path; `src/app/globals.css` reports "No file matching".

### The kitchen-sink guard fails closed

The page is visible if and only if `nodeEnv === "development"` or `vercelEnv === "preview"`. Every other combination is a 404, including a missing `VERCEL_ENV`.

### Who runs what

`npm run dev` and `npm run start` load `.env.local`, so Tomasz starts them, the same split as `npm run collect`. Once a server is up, the agent may take screenshots through the browser. `npm run build` stays agent-run, because CLAUDE.md names it as the verification command.

## Phase 1: Value source — vercel tokens and font wiring

### Overview

The token source holds the `vercel` preset, the font chain resolves to Geist and Geist Mono, and the document declares Polish with non-scaffold metadata.

### Changes Required:

#### 1. Pinned preset values

**File**: `context/changes/ui-init/tweakcn-vercel.json` (saved during planning)

**Intent**: This raw registry item is the source of record for the mapping, so the implementation needs no network and matches this plan's contrast numbers.

**Contract**:
- Verbatim response of `https://tweakcn.com/r/themes/vercel.json`, fetched 2026-09-25.
- SHA-256 `4dbb2a4738e0ae4026c71bc9aca1a986a896432314e40a75d83bf9c2150912f9`.
- The values originate from tweakcn's `utils/theme-presets.ts` (Apache-2.0).
- Do not edit this file.

#### 2. Token values

**File**: `src/app/globals.css` (`:root`, `.dark`)

**Intent**: Replace the neutral values with the preset's values in place, and record where they came from and why they were not installed with the CLI.

**Contract**:
- **`:root`.** Overwrite all 32 existing variables with `cssVars.light`. That covers the colour roles, `chart-1..5`, `sidebar-*`, and `--radius` (now `0.5rem`).
- **`.dark`.** Overwrite all 31 existing variables with `cssVars.dark`.
- No variable is added or removed, the order is unchanged, and values are copied verbatim.
- **Skip list** (not mapped):
  - `destructive-foreground`;
  - `font-sans`, `font-serif` and `font-mono`;
  - every `shadow-*`;
  - `letter-spacing`, `spacing` and `tracking-normal`;
  - the tracking scale in `cssVars.theme`;
  - the item's `css` rule for `body`.
- **Source comment** directly above `:root`. It names:
  - the preset (`vercel`);
  - the registry URL and `github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts`;
  - Apache-2.0;
  - the pinned file.

  It also states that the values were mapped by hand instead of `shadcn add <theme-url>`, which would also rewrite the font wiring and add unused tokens, and points to this plan.

#### 3. Font token wiring

**File**: `src/app/globals.css` (`@theme inline`, lines 10–12)

**Intent**: Point mono at the variable the layout will define, and record why the sans self-reference stays.

**Contract**:
- Change `--font-mono` to `var(--font-mono)`; it was `var(--font-geist-mono)`.
- `--font-sans: var(--font-sans)` and `--font-heading: var(--font-sans)` stay unchanged.
- Add a one-line comment saying:
  - the layout's `next/font` `variable` names must be `--font-sans` and `--font-mono`;
  - their unlayered class overrides this layered self-reference.

#### 4. Root layout

**File**: `src/app/layout.tsx`

**Intent**: Complete the font pairing, preload Polish glyphs for body text, declare the document language, and replace the scaffold metadata.

**Contract**:
- **Fonts.**
  - `Geist({ variable: "--font-sans", subsets: ["latin", "latin-ext"] })`.
  - `Geist_Mono({ variable: "--font-mono", subsets: ["latin"] })`. Mono carries no Polish copy; the `latin-ext` face still loads on demand through `unicode-range`.
  - Both `.variable` classes stay on `<html>`.
- **Document.** `<html lang="pl">`. The `dark` class stays.
- **Title.** `metadata.title` is `"Okazje na gry pudełkowe"`, with a code comment marking it a working title until the product is named (PRD open question 1).
- **Description.** `metadata.description` is `"Promocje na pudełkowe wydania gier, zebrane z polskich serwisów z okazjami."`

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes (run `npm run format` first if needed)
- `npm run build` succeeds
- `grep -l -- '--font-geist' .next/static/chunks/*.css` prints nothing after the build
- `grep -oE -- '--font-(sans|mono):"Geist[^}]*' .next/static/chunks/*.css` prints the Geist and Geist Mono stacks
- Every mapped variable in `:root` and `.dark` equals the pinned JSON value, and the blocks still hold 32 and 31 variables (one-off `node` comparison)

#### Manual Verification:

- With `npm run dev` started by Tomasz, DevTools → Computed → Rendered Fonts on `/` shows Geist, not a browser default
- The browser shows `lang="pl"` on `<html>` and the tab title "Okazje na gry pudełkowe"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Shared components and `/` on tokens

### Overview

The components that the PRD's states need are in the repo, and `/` shows a Polish placeholder built only from tokens and repo components. The theme becomes visible in production.

### Changes Required:

#### 1. Components

**Files**: `src/components/ui/card.tsx`, `badge.tsx`, `skeleton.tsx`, `alert.tsx` and `empty.tsx` (new)

**Intent**: Add the primitives for surface, discount tag, loading, error and empty state through the stack's own path. Later views then import them instead of inventing their own.

**Contract**:
- Run `npx shadcn add card badge skeleton alert empty`. It needs network access to the shadcn registry.
- Run `npm run format` afterwards to bring the new files to repo style. No hand edits beyond formatting.
- `button.tsx`, `globals.css`, `components.json` and `package.json` stay unchanged.

#### 2. The `/` placeholder

**File**: `src/app/page.tsx`

**Intent**: Replace the create-next-app page with a short Polish placeholder, so production stops showing scaffold content and the theme becomes visible.

**Contract**:
- A Server Component with no `next/image` and no external links.
- A centred column (`max-w-2xl`) with a 16 px side gutter on phones.
- Content, in order:
  1. `Badge` (outline): "W budowie"
  2. `h1` in `font-heading`: "Okazje na gry pudełkowe"
  3. a paragraph in `text-muted-foreground`: "Zbieramy promocje na fizyczne wydania gier z polskich serwisów z okazjami. Wkrótce zobaczysz tu tylko te, które dotyczą gier z Twojej listy."
- Semantic token classes only: no palette literal, hex or arbitrary colour value.

#### 3. Scaffold assets

**Files**: `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg` (delete)

**Intent**: Remove create-next-app assets that nothing references once `/` is replaced.

**Contract**: All five are deleted. `src/app/favicon.ico` stays, because the brand icon is deferred.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes
- `npm run build` succeeds
- `grep -rEn '(zinc|slate|gray|neutral|stone)-[0-9]|(bg|text|border)-(black|white)|#[0-9a-fA-F]{3,8}\b' src/app --include=*.tsx` prints nothing
- `grep -rnE '(next|vercel|file|globe|window)\.svg' src` prints nothing
- `git status --porcelain src/components/ui` lists exactly the five new component files

#### Manual Verification:

- Screenshots of `/` at 1280 px and 375 px, saved to `context/changes/ui-init/screenshots/`, show a black background, white heading, grey description and outline badge, no horizontal scroll at 375 px, and Polish diacritics rendered in Geist

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Kitchen sink and visual gate

### Overview

A guarded `/kitchen-sink` renders every named state of the repo's components with Polish domain copy. It is screenshotted as this change's visual gate, and its guard is proven in dev, in a local production build and on a PR preview.

### Changes Required:

#### 1. Visibility guard

**File**: `src/lib/kitchen-sink.ts` (new)

**Intent**: Keep the decision about where the kitchen sink may appear in a pure function. Its fail-closed rule then reads at a glance and can be tested without a server.

**Contract**: `export function isKitchenSinkVisible(env: { nodeEnv?: string; vercelEnv?: string }): boolean` returns `true` if and only if `nodeEnv === "development"` or `vercelEnv === "preview"`. Every other combination returns `false`, including missing values.

#### 2. Kitchen-sink route

**File**: `src/app/kitchen-sink/page.tsx` (new)

**Intent**: One page that renders every named state of the repo's components with Polish domain sample copy. It is the visual gate for this change and a reference for S-01 and S-02.

**Contract**:
- **Guard.** The component starts with `if (!isKitchenSinkVisible({ nodeEnv: process.env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV })) notFound();`, with `notFound` from `next/navigation`. The page uses no request-time API, so it prerenders, which makes it a static 404 in production builds.
- **Metadata.** `metadata.title` is `"Kitchen sink"`.
- **Notice.** A one-line notice at the top: "Strona robocza — widoczna tylko lokalnie i na podglądach PR."
- **Sections.** Headings are in Polish, and each section is built only from tokens and `src/components/ui/*`:
  1. **Typografia.**
     - A heading in `font-heading`.
     - Body text, `text-muted-foreground` text and a `font-mono` line.
     - The pangram "Zażółć gęślą jaźń" in sans and in mono.
  2. **Przyciski.**
     - Every `Button` variant in the default size: default "Zapisz", outline "Anuluj", secondary "Więcej", ghost "Pomiń", destructive "Usuń", link "Szczegóły".
     - A second row of the same six, `disabled`.
  3. **Plakietki.** `Badge` in four variants: default "−35%", secondary "PS5", outline "Pepper", destructive "Wygasła".
  4. **Karta.** One `Card`, as a token sample rather than S-01's layout:
     - title "Silent Hill 2";
     - description "PS5 · Pepper · 2 godz. temu";
     - content: the price "129,99 zł" set large, with a `Badge` "−35%";
     - footer: a `Button` "Przejdź do okazji".
  5. **Stany.**
     - Loading: three `Skeleton` rows plus a visible label "Wczytujemy okazje…" inside an element with `role="status"`.
     - Empty: `Empty` titled "Brak okazji dla Twojej listy", with the description "Ostatnie odświeżenie danych: dziś, 14:05.".
     - Error: `Alert` with `variant="destructive"`, titled "Nie udało się wczytać okazji", with the description "Spróbuj ponownie za chwilę." and an outline `Button` "Spróbuj ponownie".
- **Layout.** One column at 375 px with a 16 px side gutter and no horizontal scroll.
- **Hover and focus.** These are verified by interaction below, not faked with static classes.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes
- `npm run build` succeeds with `/kitchen-sink` prerendered as not found (local `NODE_ENV` is `production` and `VERCEL_ENV` is unset)
- The palette-literal grep from Phase 2 still prints nothing with `src/app/kitchen-sink` in place

#### Manual Verification:

- With `npm run dev` started by Tomasz, screenshots of `/kitchen-sink` at 1280×800 and 375×812, saved to `context/changes/ui-init/screenshots/`, show every section with no horizontal scroll
- Keyboard Tab shows a visible focus ring on every button, and mouse hover changes each variant's background (one screenshot of each, saved alongside)
- DevTools contrast checks match the Key Discoveries table: muted text on background and on card, the destructive alert title and description, and the destructive and primary button labels are all at least 4.5
- With `npm run build && npm run start` run by Tomasz, `/kitchen-sink` returns 404 and `/` returns 200
- On the PR preview, `/kitchen-sink` renders, or returns 404 when Vercel does not expose system environment variables; the outcome is recorded, and Tomasz decides whether to enable that setting
- After the merge to `main`, production `/kitchen-sink` returns 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None. The repository has no test runner (CLAUDE.md, Verification).
- `isKitchenSinkVisible` is pure so that a future runner can cover its truth table:

  | Input | Result |
  | --- | --- |
  | `nodeEnv: "development"` | visible |
  | `vercelEnv: "preview"` | visible |
  | `nodeEnv: "production"`, `vercelEnv: "production"` | hidden |
  | `nodeEnv: "production"`, `vercelEnv` unset | hidden (fail closed) |

### Integration Tests:

- None. The visual gate is the kitchen-sink screenshots.

### Manual Testing Steps:

1. Tomasz starts `npm run dev` and opens `/`. The theme is visible (black, white, grey) and body text renders in Geist.
2. Open `/kitchen-sink` at 1280 px and at 375 px, and screenshot both.
3. Tab through the kitchen sink: every button and link shows the focus ring. Hover each button variant.
4. Spot-check the contrast pairs from Key Discoveries with the DevTools colour picker.
5. Tomasz runs `npm run build && npm run start`: `/kitchen-sink` returns 404 and `/` returns 200.
6. Open the PR preview's `/kitchen-sink` and record whether it renders or returns 404.
7. After the merge, confirm that production `/kitchen-sink` returns 404.

## Performance Considerations

- Adding `latin-ext` to the sans font preloads a second Geist subset on first load, a few extra kilobytes that Polish copy justifies.
- Mono keeps preloading only `latin`.
- The theme itself is CSS variables only, with no runtime cost.

## Migration Notes

- No data or schema change, so no migration.
- Rollback means reverting the commits; `vercel rollback` moves traffic only.
- A later theme swap follows "Swapping the theme later" under Implementation Approach.

## References

- **Research.** `context/changes/ui-init/research.md`. A real write on a scratch copy confirms its §3 account of what `shadcn add` does; the plan still hand-maps (Key Discoveries). Its §5 contrast filter did not cover card or tinted surfaces.
- **Pinned preset.** `context/changes/ui-init/tweakcn-vercel.json`. Source: `https://tweakcn.com/r/themes/vercel.json` and `https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts` (Apache-2.0).
- **UI contract.** `.claude/skills/10x-ui/SKILL.md` (router, states, gate) and `.claude/skills/10x-ui/references/ui-quality-checklist.md` (merge checklist).
- **Next 16 docs** (`node_modules/next/dist/docs/01-app/`):
  - `03-api-reference/02-components/font.md:146-148` (`subsets`) and `:733-772` (Tailwind variable pattern);
  - `02-guides/environment-variables.md` (`NODE_ENV`, "Good to know");
  - `03-api-reference/03-file-conventions/not-found.md:13`.
- **Vercel system environment variables.** `https://vercel.com/docs/environment-variables/system-environment-variables`.
- **Product requirements.** `context/foundation/prd.md:55` (empty state with last refresh time), `:87` (visible progress) and `:88` (phone and desktop).
- **Lessons.** `context/foundation/lessons.md`, "Separate logic from I/O and from components before tests arrive".

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Value source — vercel tokens and font wiring

#### Automated

- [x] 1.1 `npm run lint` passes with zero warnings
- [x] 1.2 `npm run format:check` passes (run `npm run format` first if needed)
- [x] 1.3 `npm run build` succeeds
- [x] 1.4 `grep -l -- '--font-geist' .next/static/chunks/*.css` prints nothing after the build
- [x] 1.5 `grep -oE -- '--font-(sans|mono):"Geist[^}]*' .next/static/chunks/*.css` prints the Geist and Geist Mono stacks
- [x] 1.6 Every mapped variable in `:root` and `.dark` equals the pinned JSON value, and the blocks still hold 32 and 31 variables (one-off `node` comparison)

#### Manual

- [x] 1.7 With `npm run dev` started by Tomasz, DevTools → Computed → Rendered Fonts on `/` shows Geist, not a browser default
- [x] 1.8 The browser shows `lang="pl"` on `<html>` and the tab title "Okazje na gry pudełkowe"

### Phase 2: Shared components and `/` on tokens

#### Automated

- [ ] 2.1 `npm run lint` passes with zero warnings
- [ ] 2.2 `npm run format:check` passes
- [ ] 2.3 `npm run build` succeeds
- [ ] 2.4 `grep -rEn '(zinc|slate|gray|neutral|stone)-[0-9]|(bg|text|border)-(black|white)|#[0-9a-fA-F]{3,8}\b' src/app --include=*.tsx` prints nothing
- [ ] 2.5 `grep -rnE '(next|vercel|file|globe|window)\.svg' src` prints nothing
- [ ] 2.6 `git status --porcelain src/components/ui` lists exactly the five new component files

#### Manual

- [ ] 2.7 Screenshots of `/` at 1280 px and 375 px, saved to `context/changes/ui-init/screenshots/`, show a black background, white heading, grey description and outline badge, no horizontal scroll at 375 px, and Polish diacritics rendered in Geist

### Phase 3: Kitchen sink and visual gate

#### Automated

- [ ] 3.1 `npm run lint` passes with zero warnings
- [ ] 3.2 `npm run format:check` passes
- [ ] 3.3 `npm run build` succeeds with `/kitchen-sink` prerendered as not found (local `NODE_ENV` is `production` and `VERCEL_ENV` is unset)
- [ ] 3.4 The palette-literal grep from Phase 2 still prints nothing with `src/app/kitchen-sink` in place

#### Manual

- [ ] 3.5 With `npm run dev` started by Tomasz, screenshots of `/kitchen-sink` at 1280×800 and 375×812, saved to `context/changes/ui-init/screenshots/`, show every section with no horizontal scroll
- [ ] 3.6 Keyboard Tab shows a visible focus ring on every button, and mouse hover changes each variant's background (one screenshot of each, saved alongside)
- [ ] 3.7 DevTools contrast checks match the Key Discoveries table: muted text on background and on card, the destructive alert title and description, and the destructive and primary button labels are all at least 4.5
- [ ] 3.8 With `npm run build && npm run start` run by Tomasz, `/kitchen-sink` returns 404 and `/` returns 200
- [ ] 3.9 On the PR preview, `/kitchen-sink` renders, or returns 404 when Vercel does not expose system environment variables; the outcome is recorded, and Tomasz decides whether to enable that setting
- [ ] 3.10 After the merge to `main`, production `/kitchen-sink` returns 404
