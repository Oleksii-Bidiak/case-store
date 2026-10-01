# design-sync notes — store-admin UI

Synced surface: `apps/store-admin/src/shared/ui` (+ tokens from `apps/store-admin/src/app/globals.css`)
→ Claude Design project **«store-admin Design System»** (TASK-847).

## Projects

| Project                   | Type          | id                                     | URL                                                             |
| ------------------------- | ------------- | -------------------------------------- | --------------------------------------------------------------- |
| store-admin Design System | DESIGN_SYSTEM | `5af18e64-c9d0-40df-8299-d1ccbdb27e0b` | https://claude.ai/design/p/5af18e64-c9d0-40df-8299-d1ccbdb27e0b |
| store-admin — Pages       | PROJECT       | `d48c3b96-5979-4023-b26e-df03657a9d25` | https://claude.ai/design/p/d48c3b96-5979-4023-b26e-df03657a9d25 |

The storefront has its own pair (`.design-sync/NOTES.md`); nothing here touches it.

## Sync log (staleness check)

| Date       | Source commit (develop) | Components | Authored previews                                            |
| ---------- | ----------------------- | ---------- | ------------------------------------------------------------ |
| 2026-09-24 | `80c9ae05`              | 91         | 37 (Ukrainian copy from the admin dictionary, real `.d.ts`)  |
| 2026-09-25 | `629ad274`              | 91         | 37 — style-only resync (TASK-735/775); 12 cards spot-checked |

Before any design session: `git log <last source commit>..HEAD -- apps/store-admin/src/shared/ui apps/store-admin/src/app/globals.css`
— non-empty means the project is behind the code; re-sync first.

## How to run (the admin sync has its own home)

The converter resolves `.design-sync/` **from the cwd** — `previews/`, `overrides/`, `.cache/`,
`learnings/` are hard-wired to that name — and the storefront owns the repo-root `.design-sync/`.
So the admin sync runs from the gitignored home **`.ds-sync-admin/`**, where `.design-sync` is a
junction to `.design-sync-admin/`. `build/run.mjs` creates both junctions and wraps every command:

```sh
# once per clone (shared with the storefront): stage the converter from the design-sync skill dir
#   mkdir -p .ds-sync && cp -r <skill>/package-*.mjs <skill>/resync.mjs <skill>/lib <skill>/storybook .ds-sync/
#   echo '{"name":"ds-sync-deps","private":true}' > .ds-sync/package.json && (cd .ds-sync && npm i esbuild ts-morph @types/react)
# playwright comes from the repo root (1.62 → chromium-1234, already cached)
# re-sync: DesignSync get_file _ds_sync.json → save as .design-sync-admin/.cache/remote-sync.json
node .design-sync-admin/build/run.mjs build            # compile-css + package-build
node .design-sync-admin/build/run.mjs validate         # render check → .ds-sync-admin/ds-bundle/.render-check.json
node .design-sync-admin/build/run.mjs rebuild A,B      # preview-rebuild (presentation-only edits)
node .design-sync-admin/build/run.mjs capture [A,B]    # per-cell sheets for grading
node .design-sync-admin/build/run.mjs serve            # http-serve → /.review.html
node .design-sync-admin/build/run.mjs resync --remote .design-sync/.cache/remote-sync.json
```

Output is `.ds-sync-admin/ds-bundle/` (upload with `localDir` = that path). Paths passed to
`run.mjs` are relative to `.ds-sync-admin/`, so `.design-sync/...` there means `.design-sync-admin/...`.
Because `cfgHome` is the junction's realpath (`.design-sync-admin`), `readmeHeader` is written
relative to `.design-sync-admin/` (`"conventions.md"`), not the repo root.

## How this build works (off-script — no buildable DS package)

Same shape as the storefront: **package shape in synth-entry mode**.

- **No `--entry`**; `cfg.srcDir = "src/shared/ui"`; `--node-modules ../node_modules` (repo root —
  `@store/store-admin` is a workspace symlink there), so package-relative cfg paths use `../../../`.
- **Build-only tsconfig** (`build/tsconfig.json`) drives esbuild's aliases:
  - `@/*` → admin `src`.
  - **Bare-dir aliases pinned to files** — `@/shared/lib/seo`, `@/shared/lib/sortable-tree`,
    `@/shared/ui/live-announcer` → their `index.ts` (the converter's paths plugin returns the
    directory itself for a bare dir; esbuild then fails with "Incorrect function" on Windows).
  - **Next shims** (`build/shims/`): `next/navigation` (useRouter no-op, usePathname/useSearchParams
    read `location` — the data-table controls write the URL through `useUrlParams`), `next/dynamic`
    (React.lazy + Suspense — `RichTextEditor` is `dynamic(() => import(...), { ssr: false })`;
    esbuild inlines the import), `next-themes` (static light for the Toaster).
  - **Barrel shims**: `@/shared/config` → `dict` only (the real barrel re-exports `site.ts`, which
    reads storefront URLs from the environment); `@/shared/lib` → `cn` only.
  - `@/shared/api` is imported `import type` only — erased, no shim needed.
- **Bundle prelude** (`shims/bundle-prelude.ts`, `cfg.extraEntries[0]`): defensive `process`
  polyfill + `<html data-theme="light">` unless the page chose a theme.
- **Dark mode differs from the storefront.** The admin's globals.css has a BARE
  `@media (prefers-color-scheme: dark) { :root { … } }` — no `data-theme` guard, so the prelude's
  attribute alone would do nothing. `compile-css.mjs` rewrites that block to
  `:root:not([data-theme="light"])` and adds a `:root[data-theme="dark"]` twin (designs opt in to
  dark with `<html data-theme="dark">`). Without the attribute the cascade is exactly the app's.
  compile-css THROWS if that block's shape changes — update `darkRe` then.
- **`.d.ts` contracts come from a fork** (`overrides/dts.mjs`, `cfg.libOverrides`) — a verbatim
  copy of the storefront fork (it is generic: any types-less package with
  `src/shared/ui/index.ts`). Needs the junction `.design-sync-admin/node_modules → .ds-sync/node_modules`
  (run.mjs creates it) for its bare `ts-morph` import.
- **CSS**: `build/compile-css.mjs` runs Tailwind v4 over the WHOLE `apps/store-admin/src/**` +
  `previews/**`, reusing the admin tokens, safelisting the semantic-token utilities, wiring the
  Geist/Geist Mono/Sora fonts (Google Fonts, the admin gets them from `next/font`), and writes the
  gitignored `apps/store-admin/.ds-sync-css/ui.css` (`cfg.cssEntry`). run.mjs runs it before every
  `build`/`resync`.
- **Groups** come from the source folder: `general` for flat files, `data-table`, `sortable-tree`,
  `rich-text-editor`, `rich-text-preview`, `seo-snippet-preview`, `banner-placement-preview`,
  `live-announcer`.
- `PhoneInput` is not in `shared/ui/index.ts` (imported by path in the app) but synth-entry finds
  and exports it — 91 components.

## Gotchas

- Same tsconfig comment-stripper trap as the storefront: never put a `"//"` key in `build/tsconfig.json`.
- The repo's Bash guard blocks any command containing `.env` (incl. `process.env`) — write such files with the Write tool.
- `.design-sync-admin/build/` would be swallowed by the repo-wide `build/` ignore; `.gitignore` re-includes it (`!.design-sync-admin/build/`).
- A change to `cfg.overrides` makes `run.mjs rebuild` fail with `[CONFIG_STALE]` — run a full `build` first.
- Preview capture cells are ~640 px wide: a `Table` with `whitespace-nowrap` cells wider than that scrolls (faithful `overflow-x-auto`) and looks clipped — keep list previews to ~6 columns.
- Dialog/Sheet become near-full-screen below `md` (TASK-258) — their card viewports are ≥ 880 px wide so the card shows the desktop surface.

## Known render warns

- None from validate (91/91 clean, 0 bad/thin). Everything below is faithful to the code —
  re-grade the named cells when the fix lands:
- Fixed as of `629ad274` (TASK-735/775): invalid fields get the red border, `Badge` has no grey
  rim (`border-transparent` now wins — AdminShell follows), TableToolbar is a row from `md`,
  disabled controls use `--color-disabled*`. Still dimmed by opacity, faithfully:
  DropdownMenu items (TASK-962), ReorderUndoButton (TASK-963), the RTE image button (TASK-964).
- TableFilters' fixed-width triggers truncate long labels («Будь-який залишок»); TableSearch
  truncates long placeholders — same in the real lists.
- RichTextEditor's table buttons look disabled unless the caret is inside a table.
- Sheet's close button shows a focus ring — Radix focuses it on open.
- BannerPlacementPreview shows the desktop placement only (mobile needs a click on its toggle).

## Preview scope

37 authored previews (Ukrainian copy from `apps/store-admin/src/shared/config/dictionary.ts`
and real widget usages): Button, Badge, Input, Textarea, Label, Checkbox, Switch, Select,
Combobox, PhoneInput, Dialog, Sheet (the mobile nav drawer), DropdownMenu (category row
actions), Tabs, Tooltip, Table, TableSelectHead, TableSelectCell, TableToolbar, TableSearch,
TableFilters, TablePagination, PageSizeSelect, SortableColumnHeader, BulkActionsBar,
FormActionsBar, ReorderUndoButton, Skeleton, AdminFormSkeleton, Separator, CopyButton,
SingleImageUpload, RichTextEditor, RichTextPreview, SeoSnippetPreview, BannerPlacementPreview,
SortableTree. 54 on the floor card: the Dialog*/DropdownMenu*/Select*/Sheet*/Table*/Tabs*/
Tooltip* parts, Toaster and LiveAnnouncer (invisible by design).
Status badges follow the admin: active/published = default (primary), inactive/draft =
`secondary`, order status via `entities/order/status-badge.ts` — never `success` for «Активний».
Wide cards use `cardMode: "column"` (the validate `[GRID_OVERFLOW]` remedy); Dialog/Sheet/
DropdownMenu/Tooltip are `single` so the open state renders.

## Re-sync risks (watch-list)

- **`cfg.cssEntry` is generated + gitignored** — always go through `run.mjs build|resync` (it compiles first).
- **Barrel shims** list exactly what shared/ui imports from `@/shared/config` (`dict`) and `@/shared/lib` (`cn`).
  Before every sync: `grep -rn 'from "@/shared/\(config\|lib\)"' apps/store-admin/src/shared/ui` — a new name fails the build.
- **New bare-dir imports** (`@/shared/<x>` that is a folder) need a file alias in `build/tsconfig.json`.
- **New `next/*` imports** in shared/ui need a shim (today: navigation, dynamic; next-themes).
- **Dark-mode rewrite** depends on the exact shape of the globals.css dark block (compile-css throws if it changes).
- **dts fork** is a copy of the storefront's; on a converter upgrade diff both against the new `lib/dts.mjs`.
- **Interaction-driven states** aren't shown: Select/Combobox dropdowns render closed.
- **Design projects hold their own COPY of the design system** — see "After every sync" below.
- **A CSS-only change shows `changed: []`** in the resync verdict (render hashes key on sources, not
  on `globals.css`), so nothing is recaptured. Force it for the cards the change touches:
  `run.mjs capture A,B --spot-check-components A,B`, Read the sheets, re-write their grades.

## After every sync — refresh «store-admin — Pages»

The mockups live in the regular project «store-admin — Pages» (`d48c3b96-…`), which holds its
own COPY of the design system under
`_ds/store-admin-design-system-5af18e64-c9d0-40df-8299-d1ccbdb27e0b/`. An upload to the DS
project does NOT refresh it. After every admin sync:

1. **Open the DS project once** in the browser (https://claude.ai/design/p/5af18e64-c9d0-40df-8299-d1ccbdb27e0b)
   and wait for the component pane — that is what regenerates `_ds_manifest.json` and
   `_adherence.oxlintrc.json` and clears `_ds_needs_recompile`. `render_preview` does not.
   Check with claude-design `list_files` on the DS project: both files present, no sentinel.
2. `render_preview` every `*.dc.html` in Pages **before** the copy (screenshots to compare).
3. claude-design `finalize_plan` on Pages with the 6 dest paths below, then `copy_files` with
   `src_project_id: 5af18e64-c9d0-40df-8299-d1ccbdb27e0b` and each dest's `if_match` from
   `base_etags`: `README.md`, `_adherence.oxlintrc.json`, `_ds_bundle.css`, `_ds_bundle.js`,
   `_ds_manifest.json`, `styles.css` → `_ds/store-admin-design-system-5af18e64-c9d0-40df-8299-d1ccbdb27e0b/<same name>`.
4. `render_preview` every `*.dc.html` **after**; a contract change (renamed prop, new required
   field) surfaces here first.

Pages wiring: every `*.dc.html` loads `./support.js` (dc runtime, `create_support_js`) and
`<script src="./ds-base.js">` in its `<helmet>`; `ds-base.js` links `_ds_bundle.css` +
`styles.css` and loads `_ds_bundle.js` from the `_ds/…` folder above (one `base` line to edit
if the folder is renamed). There is no `theme.js` (unlike the storefront Pages): the admin has
no theme switcher, and the bundle pins `data-theme="light"`.

**AdminShell.dc.html** reproduces `apps/store-admin/src/widgets/admin-shell` (sidebar =
`admin-nav-list.tsx` in code order, the owner's full set; header; `Sheet side="left" w-72`
drawer). Opened directly (`frame="showcase"`) it shows the artboards 1440 and 390 (+ 390 with
the drawer open). Screens import one frame and lay content over `<main>` — no slots in the dc
format:

```html
<div style="position:relative;width:1440px;height:900px">
  <dc-import
    name="AdminShell"
    frame="desktop"
    active="/orders"
    hint-size="1440px,900px"
  ></dc-import>
  <div
    style="position:absolute;left:256px;top:64px;right:0;bottom:0;padding:24px"
  >
    …
  </div>
</div>
```

Mobile (`frame="mobile"` / `"mobile-drawer"`, 390 wide): content box `left:0; top:64px;
padding:16px`. Props: `active` (route, drives the highlighted item), `title`, `role`
(owner/manager/admin → header badge), `email`, `newOrders`/`pendingReviews`/`unread` (nav
counters), `height` (artboard height, default 900/844). Headings use `var(--font-sora)`:
`font-display` is an `@theme inline` token and does NOT exist as a CSS variable. Icons are the
exact lucide paths (lucide-react 1.27) rendered as CSS masks — regenerate from
`node_modules/lucide-react/dist/esm/icons/*.mjs` if the nav gains an item.
Update this file when `admin-nav-list.tsx`, `admin-header.tsx` or the drawer changes.

### Screen artboards (TASK-848 onward)

One file per section (`Login`, `Dashboard`, `Orders`, `Products`, `Categories`, `Staff`,
`Settings`, `Profile`.dc.html — group «База»; `Returns`, `Reviews`, `Users`, `Messages`,
`Subscribers`, `AuditLog`.dc.html — group «CRM»; then «Контент» and «Каталог і маркетинг». All four groups
were brought up to develop `badb77fc` by Д-ж0 (2026-09-27, TASK-852) and to `1e09651d` by Д-ж2 (2026-09-30) —
the base commit per group lives in the registry in `docs/plans/189-design-track-cycle-2.md`). Д-ж2 proposals
for «База» and «CRM» are separate files next to them — `OrdersProposal`, `OrderNewProposal`, `ProductsProposal`,
`ProductFormProposal`, `StaffProposal`, `CategoriesProposal`, `SettingsProposal`, `ProfileProposal`,
`ReturnsProposal`, `ReviewsProposal`, `UsersProposal`, `MessagesProposal`, `SubscribersProposal`,
`AuditLogProposal`.dc.html; Д-ж3 (2026-10-01) did the same for «Контент» and «Каталог і маркетинг» —
`PagesProposal`, `BlogProposal`, `RichTextEditorProposal`, `BlogCategoriesProposal`, `BannersProposal`,
`CarouselsProposal`, `FaqProposal`, `ContentMapProposal`, `MediaProposal`, `BrandsProposal`, `DevicesProposal`,
`AddonServicesProposal`, `ProductGroupsProposal`, `DiscountsProposal`, `CatalogImportProposal`,
`ProductPreviewProposal`.dc.html — and the pre-session state is kept as `<Name>-before.dc.html`. Proposals pass
`proposed="true"` to AdminShell (Returns counter, help button, «Клієнти» / «Співробітники» labels); the
as-is files do not, so they keep drawing the code. Keep proposal files under ~70 KB each: a larger
`write_files` payload was cut off before it ran — split a section into its own file instead. Each file is a canvas like AdminShell's showcase:
the section's screens at 1440 and 390, then the states the code has (loading, empty, error,
confirm dialogs) at 1440 only, unless 390 lays them out differently. They draw the code **as
is** — every known defect they reproduce is listed in the file's `<style>` header comment, and
a mismatch with the code is an artboard bug, not a design proposal. Conventions:

- The screen is plain CSS classes transcribing the Tailwind classes to px + `var(--color-*)`,
  not bundle utilities: `md:`/`lg:` react to the window, not the artboard. The 390 variant is
  the same markup with a `.m` modifier that `renderVals()` sets per frame.
- Content sits in an absolute box over AdminShell's `<main>` (`left:256px;top:64px;padding:24px`,
  mobile `left:0;padding:16px`); `componentDidMount` measures it (`[data-ov]` height + 64) and
  feeds the frame height back, dialog frames stay 900/844.
- Texts are verbatim from `shared/config/dictionary.ts`; data from the seed; money is formatted
  in the browser with the app's `Intl` options (Chromium prints «грн»).
- dc pitfalls: never mix a `{{ }}` hole with text in `style` (wrap the icon in a coloured span);
  `<textarea>{{ x }}</textarea>` renders `[object Object]` — use `value="{{ x }}"`; `.prose`
  collides with the bundle's typography plugin (65ch) — pick another class name.
- The 390 dialog carries the `m` class on ITSELF (`dlg k m`), so its near-full-screen rule must be
  the compound `.dlg.m`, not the descendant `.m .dlg` (fixed in Orders, Products, Categories, Staff by
  Д-ж0 — `top-4 h-[calc(100%-2rem)]` now renders).
- Role variants ("менеджер без X:write") pass `role`/`email` to AdminShell; it only changes the header
  badge — the sidebar still shows the owner's full nav (AdminShell cannot filter by rights yet).
- A cell with `max-w-xs` + `whitespace-nowrap` really is capped at 320px in Chromium and its text
  runs on into the next column — draw it that way, it is what the admin shows.
- Pre-render before uploading: open any Pages `serve_url` in Playwright with `page.route` fulfilling
  that path from the local file — relative `support.js` / `ds-base.js` / `_ds` / `AdminShell` resolve
  against the project, so a new file renders exactly as it will once written.
