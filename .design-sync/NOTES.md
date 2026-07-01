# design-sync notes — store-client storefront UI

Synced surface: `apps/store-client/src/shared/ui` → Claude Design project
`store-client Design System` (projectId in config.json).

## How this build works (off-script — no buildable DS package)

store-client is a Next.js app, not a published component library, so this is a
**package shape in synth-entry mode**:

- **No `--entry`** is passed → the converter synthesizes an entry from `src/`.
  `cfg.srcDir = "src/shared/ui"` scopes discovery to the UI layer only.
- **`--node-modules ./node_modules`** (repo root) — `@store/store-client` is a
  workspace symlink there and react/react-dom are hoisted there.
- A **build-only tsconfig** (`.design-sync/build/tsconfig.json`) drives esbuild's
  path resolution via `cfg.tsconfig`. Its `paths` do three jobs:
  - `@/*` → app `src` (app-internal imports like `@/shared/lib/utils`).
  - **Next shims** (`.design-sync/build/shims/`): `next/link`, `next/image` → plain
    `<a>`/`<img>`; `next-themes` → static light theme. Standalone bundle has no Next.
  - **Barrel shims**: `@/shared/config` → dictionary only, `@/shared/lib` →
    format + product-gradient only. The real barrels pull `site.ts`
    (`process.env.NEXT_PUBLIC_*`) and `schema/` (API clients + axios instance,
    `process.env.NEXT_PUBLIC_API_URL`), which throw `process is not defined` in the
    browser bundle. The UI only needs `dict`, `formatMoney`, `pickProductGradient`.
- **CSS**: there is no precompiled stylesheet. `.design-sync/build/compile-css.mjs`
  runs Tailwind v4 (`@tailwindcss/postcss`) over `src/shared/**` + `previews/**`,
  reusing the app's token definitions from `src/app/globals.css`, and writes the
  GITIGNORED `apps/store-client/.ds-sync-css/ui.css` used as `cfg.cssEntry`.
  It also safelists the semantic-token utilities (`@source inline(...)`) and wires
  the brand fonts (see Fonts below).

## Gotchas (cost real debugging — keep)

- **tsconfig comment-stripper**: the converter's `tsconfigPathsPlugin` runs a naive
  `//` comment strip that corrupts a `"//"` JSON _key_, breaking `JSON.parse` so the
  plugin silently returns null (then `@/` only works via esbuild's native app-tsconfig
  autodetect and the Next shims never load). NEVER put comment-like keys in
  `.design-sync/build/tsconfig.json`.
- **Bare-dir path aliases**: that plugin returns the directory itself for a bare-dir
  specifier (e.g. `@/shared/lib`), which esbuild can't read ("Incorrect function" on
  Windows). Point such aliases at a concrete file (`/index.ts`) or a shim.

## Fonts

Brand fonts (Geist / Geist Mono / Sora) are injected by `next/font` at runtime in the
app, so `--font-geist-sans|geist-mono|sora` are undefined in a standalone bundle.
`compile-css.mjs` loads them from Google Fonts (remote `@import`) and defines the vars.
`[FONT_REMOTE]`/no `[FONT_MISSING]` — fonts load at runtime; offline renders fall back
to system sans (harmless). Display font (Sora) is used for headings & prices.

## Known render warns

None — the final validate ran clean (48/48, 0 bad, no warnings).

## Preview scope

21 authored previews (the composite/parent set). 27 subcomponents
(Dialog*/Select*/Sheet*/Tabs* parts) ship the typographic floor card — authorable on
any future re-sync. Toaster ships its floor card (no static visual without live toasts).

## Re-sync risks (watch-list)

- **`cfg.cssEntry` is generated + gitignored.** Run `node .design-sync/build/compile-css.mjs`
  BEFORE every `package-build`/driver run, or the build copies a stale/missing stylesheet.
- **Tokens track `src/app/globals.css`.** compile-css strips its `@import 'tailwindcss'`
  and `@plugin '@tailwindcss/typography'` lines and re-adds scoped versions. If those
  lines' format changes, update the strip regexes in compile-css.mjs.
- **Fonts** depend on the remote Google Fonts families staying named Geist/Geist Mono/Sora.
  If the app changes its brand fonts, update the `@import` + `:root` block in compile-css.mjs.
- **Barrel shims** assume the UI only consumes `dict` / `formatMoney` /
  `pickProductGradient`. If a shared/ui component starts importing other things from
  `@/shared/config` or `@/shared/lib`, extend `.design-sync/build/shims/shared-{config,lib}.ts`
  (or a new `process.env`/API import will reintroduce `process is not defined`).
- **Interaction-driven states** aren't shown: Select dropdown, Combobox list, and the
  AccountDropdown menu render closed/trigger-only (internal open state, no `open` prop).
  Dialog/Sheet are forced open via `cfg.overrides.{Dialog,Sheet}.cardMode = "single"`.
- **ProductCard preview** uses an inline mock cast `as any`; if `PublicProductEntity`
  changes materially, refresh the mock fields in `.design-sync/previews/ProductCard.tsx`.
