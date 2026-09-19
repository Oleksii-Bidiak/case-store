# design-sync notes — store-client storefront UI

Synced surface: `apps/store-client/src/shared/ui` → Claude Design project
`store-client Design System` (projectId in config.json).

## Sync log (staleness check)

| Date       | Source commit (develop) | Components | Authored previews                 |
| ---------- | ----------------------- | ---------- | --------------------------------- |
| 2026-07-01 | `25064fe5`              | 48         | 21 (English copy, empty `.d.ts`)  |
| 2026-09-19 | `09aaa712`              | 56         | 29 (Ukrainian copy, real `.d.ts`) |

Before any design session: `git log <last source commit>..HEAD -- apps/store-client/src/shared/ui apps/store-client/src/app/globals.css`
— non-empty means the project is behind the code; re-sync first (runbook S7.1).

## How this build works (off-script — no buildable DS package)

store-client is a Next.js app, not a published component library, so this is a
**package shape in synth-entry mode**:

- **No `--entry`** is passed → the converter synthesizes an entry from `src/`.
  `cfg.srcDir = "src/shared/ui"` scopes discovery to the UI layer only.
- **`--node-modules ./node_modules`** (repo root) — `@store/store-client` is a
  workspace symlink there and react/react-dom are hoisted there. Package-relative cfg
  paths therefore resolve from `node_modules/@store/store-client`, which is why repo
  files are reached with `../../../` (tsconfig, extraEntries).
- A **build-only tsconfig** (`.design-sync/build/tsconfig.json`) drives esbuild's
  path resolution via `cfg.tsconfig`. Its `paths` do three jobs:
  - `@/*` → app `src` (app-internal imports like `@/shared/lib/utils`).
  - **Next shims** (`.design-sync/build/shims/`): `next/link`, `next/image` → plain
    `<a>`/`<img>`; `next-themes` → static light theme. Standalone bundle has no Next.
  - **Barrel shims**: `@/shared/config` → `dict` + `SITE_NAME`; `@/shared/lib` →
    format, product-gradient, product-pricing, color-swatch. The real barrels pull
    `schema/` (API clients + axios) and other modules the UI never needs.
- **Bundle prelude** (`shims/bundle-prelude.ts`, `cfg.extraEntries[0]` — extraEntries
  are emitted before the main entry, so it evaluates first). Two jobs: (1) polyfills
  `process` with an empty env — `site.ts` and `category-tile-image.tsx` read
  `process.env.NEXT_PUBLIC_*` at module load, which Next inlines but a plain bundle
  cannot; (2) sets `<html data-theme="light">` unless the page chose a theme.
- **`.d.ts` contracts come from a fork** (`.design-sync/overrides/dts.mjs`,
  `cfg.libOverrides`). Upstream looks for a `.d.ts` tree; the app has none, so until
  2026-09-19 EVERY `<Name>.d.ts` shipped as `[key: string]: unknown` (the design agent
  knew no props at all — the 2026-07-01 validate still ran clean, it does not check
  this). The fork builds the ts-morph project from the app tsconfig +
  `src/shared/ui/**/*.{ts,tsx}` with `index.ts` as the entry. It needs the junction
  `.design-sync/node_modules → .ds-sync/node_modules` (for its bare `ts-morph` import;
  gitignored — recreate per clone: `cmd //c "mklink /J .design-sync\\node_modules .ds-sync\\node_modules"`).
  Expected empty contracts: `CheckoutSkeleton` (no props), `DialogOverlay`,
  `DialogPortal`, `SelectScrollUpButton`, `SelectScrollDownButton` (pure Radix pass-through).
- **CSS**: there is no precompiled stylesheet. `.design-sync/build/compile-css.mjs`
  runs Tailwind v4 (`@tailwindcss/postcss`) over the WHOLE `apps/store-client/src/**`
  (not just `shared/**` — since 2026-09-19, so every layout utility the site uses
  exists for the design agent's glue; ~158 KB) + `previews/**`, reusing the app's
  token definitions from `src/app/globals.css`, and writes the GITIGNORED
  `apps/store-client/.ds-sync-css/ui.css` used as `cfg.cssEntry`. It also safelists the
  semantic-token utilities (`@source inline(...)`) and wires the brand fonts.

## Gotchas (cost real debugging — keep)

- **tsconfig comment-stripper**: the converter's `tsconfigPathsPlugin` runs a naive
  `//` comment strip that corrupts a `"//"` JSON _key_, breaking `JSON.parse` so the
  plugin silently returns null (then `@/` only works via esbuild's native app-tsconfig
  autodetect and the Next shims never load). NEVER put comment-like keys in
  `.design-sync/build/tsconfig.json`.
- **Bare-dir path aliases**: that plugin returns the directory itself for a bare-dir
  specifier (e.g. `@/shared/lib`), which esbuild can't read ("Incorrect function" on
  Windows). Point such aliases at a concrete file (`/index.ts`) or a shim.
- **Preview cards paint `body{background:#fff}`** (emitted by the converter's
  `emit.mjs` — not forkable), while globals.css turns every token dark under
  `prefers-color-scheme: dark`. On a dark-OS viewer that meant light text on white
  (reported by the owner as "unreadable labels / RichText"). The prelude's light-theme
  pin fixes it; do not remove it.
- **The repo's Bash guard blocks any command containing the substring `.env`** —
  including `process.env` in a heredoc. Write such files with the Write tool.
- **The bundled lib files are CRLF.** When forking one, normalize line endings before
  splicing, or anchor searches silently miss.
- **`.design-sync/build/` was silently gitignored until 2026-09-19** by the repo-wide
  `build/` rule, so compile-css, the shims and the build tsconfig existed only on one
  machine. `.gitignore` now re-includes it (`!.design-sync/build/`); keep that line.
- **A contract change (config/prelude/fork edit) deletes every `.grade.json`** in
  `.design-sync/.cache/review/` on the next capture; re-grade from the fresh sheets.

## Fonts

Brand fonts (Geist / Geist Mono / Sora) are injected by `next/font` at runtime in the
app, so `--font-geist-sans|geist-mono|sora` are undefined in a standalone bundle.
`compile-css.mjs` loads them from Google Fonts (remote `@import`) and defines the vars.
`[FONT_REMOTE]`/no `[FONT_MISSING]` — fonts load at runtime; offline renders fall back
to system sans (harmless). Display font (Sora) is used for headings & prices.

## Known render warns

- None from validate (56/56 clean).
- `Input › Invalid` shows no red border — faithful to the site: an unlayered
  `* { border-color }` in globals.css beats every `border-*` utility (TASK-735).
  Re-grade the cell after that fix lands.
- Disabled states (`Select`, `Input`, `Textarea`) are faint — site styling,
  `disabled:opacity-50` over muted text (TASK-736).

## Preview scope

29 authored previews (Ukrainian copy from the storefront dictionary; no raw hex — the
category tile reuses the site's oklch `categoryGradient` formula). 27 subcomponents
(Dialog*/Select*/Sheet*/Tabs* parts) + Toaster ship the typographic floor card.

## Re-sync risks (watch-list)

- **`cfg.cssEntry` is generated + gitignored.** Run `node .design-sync/build/compile-css.mjs`
  BEFORE every driver run, or the build copies a stale/missing stylesheet.
- **Tokens track `src/app/globals.css`.** compile-css strips its `@import 'tailwindcss'`
  and `@plugin '@tailwindcss/typography'` lines and re-adds scoped versions. If those
  lines' format changes, update the strip regexes in compile-css.mjs.
- **Fonts** depend on the remote Google Fonts families staying named Geist/Geist Mono/Sora.
- **Barrel shims** list exactly what shared/ui imports from `@/shared/config` and
  `@/shared/lib`. Before every sync: `grep -rn 'from "@/shared/\(config\|lib\)"' apps/store-client/src/shared/ui`
  — a new name missing from the shim fails the build (or, if it reads `process.env`
  at load, renders every card empty with `process is not defined`).
- **dts fork** asserts the package still has no types entry and still has
  `src/shared/ui/index.ts`; it throws loudly otherwise. On a converter upgrade, diff
  it against the new `lib/dts.mjs` (only `projectFor` + the `realpathSync` import differ).
- **Interaction-driven states** aren't shown: Select dropdown, Combobox list, and the
  AccountDropdown menu render closed/trigger-only (internal open state, no `open` prop).
  Dialog/Sheet are forced open via `cfg.overrides.{Dialog,Sheet}.cardMode = "single"`.
- **ProductCard preview** uses an inline mock cast `as any` and MUST set `inStock`
  (otherwise every card renders «Немає в наявності» — happened once, TASK-362 changed
  the card). If `PublicProductEntity` changes, refresh `.design-sync/previews/ProductCard.tsx`.
- **The Claude Design project also holds files this sync does not own**:
  `templates/homepage`, `templates/cart`, `screenshots/`, `uploads/`. Never put them
  in a plan's deletes; their freshness is audited separately (runbook S7.2).
