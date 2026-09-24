# store-admin UI — conventions for building with this design system

The **admin panel** of a Ukrainian mobile-accessories shop (CaseStore): React + **Tailwind CSS
v4** with **semantic design tokens** — the same token names as the storefront. The library is
shadcn/ui primitives plus admin blocks (data tables, bulk actions, form bars, rich text, SEO and
banner previews, a sortable tree). Components are presentational: data and handlers come in
through props. Build screens by composing them and style your own layout glue with the
token-bound utilities below.

## Setup

- **No provider is required** — load `styles.css` and use `window.StoreAdminUI.*` directly
  (`Tooltip` brings its own `TooltipProvider`). One optional wrapper, used the way the admin
  uses it: wrap a list screen in `LiveAnnouncer` — `TableToolbar`'s refresh and
  `SortableTree`'s drag moves announce through it (without it they are silent, not broken).
- **Theme: light by default.** The bundle sets `<html data-theme="light">`; for a dark mockup set
  `<html data-theme="dark">`. Paint pages with `bg-background text-foreground`, never fixed white.
- Fonts come with `styles.css`: **Geist** (`font-sans`), **Geist Mono** (`font-mono`),
  **Sora** (`font-display` — page and section titles).
- Breakpoints matter: `Dialog` and `Sheet` become near-full-screen below `md` (768px);
  `Table layout="card"` turns rows into stacked cards below `md`.

## Copy

- **All UI text is Ukrainian** ("Зберегти", "Скасувати", "Редагувати", "Видалити",
  "Пошук товарів…", "Вибрати всі рядки на сторінці"). Never ship English labels.
- Money `1 199 ₴` (space thousands), dates `12.09.2026`, order numbers `#A1B2C3D4`.

## Styling idiom — Tailwind utilities bound to semantic tokens

Never hardcode hex colours. Colour names are semantic tokens (`bg-<name>`, `text-<name>`, `border-<name>`):

| Family        | Names                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Surfaces      | `background`, `foreground`, `card` (`card-foreground`), `popover` (`popover-foreground`), `muted` (`muted-foreground`), `accent` (`accent-foreground`) |
| Actions       | `primary` (`primary-foreground`), `secondary` (`secondary-foreground`), `destructive` (`destructive-foreground`)                                       |
| Status        | `success`, `warning`, `sale` (each with `-foreground`)                                                                                                 |
| Lines / focus | `border-border`, `border-input`; focus only as `focus-visible:ring-ring`                                                                               |
| Radius        | `rounded-sm` · `rounded-md` · `rounded-lg` · `rounded-xl` · `rounded-2xl` (base `--radius` 0.75rem)                                                    |
| Elevation     | `shadow-card` (sidebar, header, panels) · `shadow-elevated` · `shadow-lift`                                                                            |

Admin page chrome, as the real shell draws it: sidebar `w-64 bg-card border-r border-border
shadow-card`; header `h-16 bg-card border-b border-border shadow-card`; content `p-4 lg:p-6`;
active nav item `bg-primary text-primary-foreground`, idle `text-muted-foreground hover:bg-accent`.

## Admin conventions

- **Lists** = `TableToolbar` (`search` → `TableSearch`, `filters` → `TableFilters`,
  `selectAll`, `onRefresh`) + `BulkActionsBar` (only while rows are selected) + `Table
layout="card"` with `TableSelectHead`/`TableSelectCell` + `TablePagination`. Header cells
  that sort use `SortableColumnHeader`. Name cells: `font-medium` name + `text-xs
text-muted-foreground` meta line; secondary cells `text-muted-foreground`; the row action is
  `<Button variant="outline" size="sm">Редагувати</Button>`.
- **Status badges**: default (primary) «Активний» / «Опубліковано», `secondary`
  «Неактивний» / «Прихований» / «Чернетка», `warning` for scheduled or awaiting action
  («Заплановано на 01.10.2026», «Очікує оплати»). Order status: DELIVERED → `success`,
  PENDING → `warning`, CONFIRMED/SHIPPED → default, CANCELLED/REFUNDED → `destructive`.
  Nav counters are default `Badge` (`secondary` on the active item).
- **Forms**: `Label` + `Input` / `Textarea` / `Select` / `Combobox` / `PhoneInput` /
  `Switch` / `Checkbox`, errors as `aria-invalid` + a `text-destructive` line; the submit row is
  `FormActionsBar`; loading states are `AdminFormSkeleton` / `Skeleton`.
- **Content editing**: `RichTextEditor` (Tiptap) with `RichTextPreview`; `SeoSnippetPreview`
  beside SEO fields; `BannerPlacementPreview` beside banner fields; `SingleImageUpload` for logos
  and covers; `SortableTree` for drag-reorderable trees (categories, FAQ).
- **Confirmations** are `Dialog` (never a browser confirm); side panels and the mobile nav are
  `Sheet side="left"`; row menus are `DropdownMenu`.

## Where the truth lives

Read `styles.css` and the `_ds_bundle.css` it imports (the `:root` tokens live there) before
styling, and each component's `<Name>.prompt.md` + `<Name>.d.ts` for its API.

## Build snippet

```tsx
<LiveAnnouncer>
  <TableToolbar
    onRefresh={refresh}
    search={
      <TableSearch
        value=""
        placeholder="Пошук товарів…"
        label="Пошук товарів"
      />
    }
  />
  <Table layout="card">
    <TableHeader>
      <TableRow>
        <TableHead>Назва</TableHead>
        <TableHead>Статус</TableHead>
        <TableHead className="text-right">Дії</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow rowLabel="Чохол Spigen Ultra Hybrid для iPhone 15 Pro">
        <TableCell label="Назва" className="font-medium">
          Чохол Spigen Ultra Hybrid для iPhone 15 Pro
        </TableCell>
        <TableCell label="Статус">
          <Badge>Активний</Badge>
        </TableCell>
        <TableCell label="Дії" className="text-right">
          <Button variant="outline" size="sm">
            Редагувати
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</LiveAnnouncer>
```
