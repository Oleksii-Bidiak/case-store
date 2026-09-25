# design-sync notes — store-client storefront UI

Synced surface: `apps/store-client/src/shared/ui` → Claude Design project
`store-client Design System` (projectId in config.json).

## Sync log (staleness check)

| Date       | Source commit (develop) | Components | Authored previews                 |
| ---------- | ----------------------- | ---------- | --------------------------------- |
| 2026-07-01 | `25064fe5`              | 48         | 21 (English copy, empty `.d.ts`)  |
| 2026-09-19 | `09aaa712`              | 56         | 29 (Ukrainian copy, real `.d.ts`) |
| 2026-09-25 | `57aa2a97`              | 56         | 29 (re-graded after TASK-735/736) |

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
- 2026-09-25: `Input › Invalid` now shows the red `destructive` border (TASK-735 moved
  `* { border-color }` into `@layer base`). Disabled cells of Button/Input/Textarea/Select are
  readable (`bg-disabled` + `text-disabled-foreground`, TASK-736). Both earlier warns are closed.

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
- **Design projects hold their own COPY of the design system.** The store's mockups live
  in the regular project «store-client — Pages» (`a8ec3567-e819-4d5c-948c-04a1a8fd47aa`),
  which binds a snapshot under `_ds/store-client-design-system-<projectId>/` (README,
  `_adherence.oxlintrc.json`, `_ds_bundle.{js,css}`, `_ds_manifest.json`, `styles.css`).
  An upload to the design-system project does NOT refresh it — until 2026-09-19 Pages ran
  the July bundle. After every sync: wait until the DS project's `_ds_manifest.json` is
  regenerated (the owner must open the project in the browser; the sentinel
  `_ds_needs_recompile` disappears and the manifest/adherence etags change. Polling alone never
  triggers it), then `copy_files` those 6 files from the DS project
  into Pages (claude-design MCP, `finalize_plan` + `if_match`), and screenshot every Pages
  `*.dc.html` before/after. Contract changes surface there first: 2026-09-19 the new
  `ProductCard` rendered every mock product «Немає в наявності» because Pages' mock data
  had no `inStock`.
- **Style-only changes do NOT re-verify anything.** Grades key on the authored previews
  (`sourceKeys`), so a `globals.css` or `shared/ui` class change reports "56
  verified-by-upload, 0 changed". When the component sources changed, force a look:
  `node .ds-sync/package-capture.mjs --out ./ds-bundle --components <changed> --spot-check-components <changed>`.
  Then Read the sheets, re-write the grades, and eyeball all 4 contact sheets (2026-09-25 did
  this for Button/Input/Label/Select/Tabs/Textarea).
- **Validate can crash Chromium on Windows inside the driver** (exit `3221226505` =
  `0xC0000409`, verdict `ok:false` with build+diff fine). Re-run
  `node .ds-sync/package-validate.mjs ./ds-bundle` standalone. On 2026-09-25 it then passed, and
  the next driver run was clean too.
- **Pages screenshots** live in `docs/images/design-sync/<date>-{before,after}-<Page>.png`
  (committed; before = pre-copy, after = post-copy + data edits). The script is
  `.design-sync/.cache/shot-pages.mjs` (gitignored). It reads `<serve base>|<token>` from stdin,
  and the token comes from one `render_preview` because it is project-scoped. Keep the token out
  of files. **`curl` on the serve URL is NOT the stored file.** The endpoint inserts the preview
  runtime (`<style data-omelette-injected>…</style><script data-omelette-injected>…</script>` +
  `\n\n`, about 20 KB) right after `<head>\n`. Removing exactly that recovers the stored bytes:
  checked 2026-09-25 against `read_file` (Catalog, byte-identical) and against `list_files`
  sizes (4 more files). This is how 60–90 KB mock-data edits are built and verified after
  `write_files`, since `read_file` of such files overflows. Writing a served copy back would
  bake the runtime into the mockup.
- **The Claude Design project also holds files this sync does not own**:
  `templates/homepage`, `templates/cart`, `screenshots/`, `uploads/`. Never put them
  in a plan's deletes; their freshness is audited separately (runbook S7.2).
