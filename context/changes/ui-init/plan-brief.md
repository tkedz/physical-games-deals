# UI Foundation (ui-init) — Plan Brief

> Full plan: `context/changes/ui-init/plan.md`
> Research: `context/changes/ui-init/research.md`

## What & Why

This change lays the UI foundation on the shadcn/ui setup already in the repository. The values of tweakcn's built-in `vercel` theme go into the existing token source. The change also fixes the three problems the research found:

- the font tokens never resolve, so every page renders in the browser's default font;
- the only page ignores the tokens;
- the components for the PRD's loading, empty and error states are missing.

A kitchen-sink page screenshotted in every state proves the result. The first product screens (S-01 deals, S-02 accounts) then start from tokens and components instead of inventing their own.

## Starting Point

- shadcn/ui (`base-nova`, on Base UI) is initialised and its tokens live in `src/app/globals.css`.
- Nothing reads those tokens yet. `/` is still the create-next-app page with literal colours, and the only component, `Button`, is used nowhere.
- The layout forces dark mode, says `lang="en"` and has the title "Create Next App".

## Desired End State

- `/` shows a short Polish placeholder in the `vercel` theme (black, white, grey), set in Geist, built only from semantic tokens and repo components.
- `/kitchen-sink` shows every component state with Polish sample copy. It is visible locally and on PR previews, and returns 404 in production.
- The theme's values sit in one place with a source line. A later colour swap is a mechanical re-mapping of those values.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Design system | Extend the existing shadcn `base-nova`; no `shadcn init` | CLAUDE.md forbids a second design system on a repo that has one. | Research |
| Theme | tweakcn built-in `vercel` preset | The user's pick after considering amber-minimal and a community "Spotify" theme: it passes every dark-mode contrast pair without deviations and keeps Geist. | Plan |
| Install route | Hand-map the values into the existing `:root`/`.dark` from a pinned JSON | `shadcn add` would also rewrite the font wiring and add some twenty unused tokens and mappings, each needing pruning; mapping the 63 values in place reaches the same colours in one step. | Plan (Research proposed CLI + pruning) |
| Colour mode | Keep dark forced | This keeps the 2026-09-18 decision (`9f20e57`) and one contrast gate instead of two. | Plan |
| UI language | Polish: `lang="pl"`, `latin-ext` preloaded for the sans font | The persona, the source aggregators and the prices are Polish. | Plan |
| Font wiring | shadcn pairing: `next/font` `variable: "--font-sans"` / `"--font-mono"` | The unlayered `next/font` class overrides Tailwind's layered self-reference, which ends the cycle. | Research, confirmed in Plan |
| `/` | Polish placeholder on tokens | Production stops showing scaffold content, and the theme becomes visible. | Plan |
| Gate | `/kitchen-sink`: dev and PR preview, 404 in production, behind a pure fail-closed guard | `NODE_ENV` cannot tell a preview from production, and a missing `VERCEL_ENV` must hide the page, not show it. | Plan |
| Components | `card`, `badge`, `skeleton`, `alert`, `empty` | One per state the PRD names; the dry-run showed pure file creates with no new dependencies. | Research + Plan |
| Kitchen-sink content | Components in all 7 states with domain sample copy; no deal-row layout | S-01 designs its own view; 10x-ui says not to generate a view that does not exist yet. | Plan |

## Scope

**In scope:**
- `vercel` values in `:root` and `.dark`, radius `0.5rem`, and a source comment
- The font pairing for Geist and Geist Mono, `lang="pl"`, and the working title and description
- Five shadcn components; `/` rebuilt as a token-only Polish placeholder; scaffold SVGs removed
- `/kitchen-sink` with the fail-closed guard, screenshots at 1280 px and 375 px, contrast checks, and guard checks

**Out of scope:**
- Light mode, a theme toggle and `next-themes`
- Shadow and tracking tokens, `--destructive-foreground` and `--font-serif`
- The deals view and deal-row layout (S-01), and auth screens (S-02)
- A favicon or brand mark (waits for the product name)
- Screenshot-test tooling and form controls

## Architecture / Approach

The work follows the 10x-ui order: value source, then shared components and one view, then states and the gate. `globals.css` stays the only source of values: its existing blocks change values in place, and `layout.tsx` feeds the font variables the stylesheet already references. Views consume only semantic tokens and `src/components/ui/*`. The kitchen sink decides its own visibility through a pure predicate (`isKitchenSinkVisible`), as `lessons.md` requires for decisions.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Value source | `vercel` values in the token blocks, fonts resolving to Geist, `lang="pl"`, new metadata | Silent fallback to the browser font if the font variable names ever drift |
| 2. Components + `/` | Five shadcn components; a token-only Polish placeholder on `/` | CLI output needs `npm run format` before the gate passes |
| 3. Kitchen sink + gate | `/kitchen-sink` with every state; screenshots; 404 in production | The preview shows 404 if Vercel does not expose system environment variables |

**Prerequisites:** network access to the shadcn registry for `shadcn add` (the theme values are already pinned in the change folder). Tomasz starts `npm run dev` and `npm run start` for the manual checks, because both load `.env.local`.

**Estimated effort:** about 1–2 sessions across 3 phases.

## Open Risks & Assumptions

- **Preview visibility.** Whether PR previews show the kitchen sink depends on a Vercel project setting that cannot be checked from the repository. The fallback is a local-only gate; production stays 404 either way.
- **Light block unverified.** Its values are written but never rendered while dark mode is forced. Light `--destructive` on the background is 3.73.
- **Misleading CLI preview.** In shadcn 4.21.0, `shadcn add --dry-run` shows the wrong shape for any item that carries `cssVars`. Judge such items by the real `git diff`, not by the preview.
- **Upstream drift.** The preset can change on tweakcn, so the pinned JSON (SHA-256 `4dbb2a47…`) is the source of record.

## Success Criteria (Summary)

- `/` renders the theme in Geist with Polish copy, and no literal colours remain in views.
- The kitchen sink shows default, hover, focus, disabled, error, empty and loading states, with every text pair at contrast 4.5 or higher at both widths.
- The kitchen sink returns 404 in a production build, and lint, format and build all pass.
