# Plan 147 — Slug-Redirect Guard for Admin-Managed Pages, Posts, Products & Categories

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 7 — SEO/GEO (`docs/handoff-seo.md`) — доріжка B, task 3 of 3
> (SEO-3/TASK-279 → SEO-4/TASK-280 → **SEO-10/TASK-285**)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG task:** TASK-285
> **Source:** `docs/handoff-seo.md` §SEO-10 (Блок III) + owner decision 2026-07-11 (scope
> expanded from Page/BlogPost to **Page + BlogPost + Product + Category**, all four at once)
> **Worktree:** `D:\projects\store-ai-wt-b`, branch `feature/279-seo-branding-verify-slugguard`
> (third and final task on this branch, per plan 145/146's own "doріжка B" note; TASK-279 and
> TASK-280 already committed there)

## Overview

Pages, blog posts, products, and categories all get their `slug` from an editable admin text
input with **zero write-time protection**: an admin can freely retype a live entity's slug,
instantly 404-ing its public URL with no warning and no server-side redirect. For a page or post
that has been indexed by Google, this is a silent ranking/traffic loss the admin has no way to
notice until it's already happened. The storefront routes (`/legal/[slug]`, `/blog/[slug]`,
`/products/[slug]`, and — once TASK-277 ships — `/categories/[slug]`) are otherwise SEO-safe
(SSR, own meta fields, publish lifecycle, dynamic sitemap); this is the one remaining "human
factor" gap the source handoff flags.

This plan closes it with three pieces, in order:

1. A new `SlugRedirect` ledger table + a **write-time chain-collapsing algorithm** so a rename
   (or a rename-of-a-rename, or a rename-back-to-the-original) always resolves to exactly one
   direct 301, never a chain and never a loop — recorded **transactionally** alongside the
   entity's own slug update, and **only** when the entity was publicly visible at the moment of
   the rename.
2. Admin-form warnings (all four entities) before an accidental rename ships, plus a
   delete-warning on the two entities that have a real hard-delete admin action (Page, BlogPost).
3. Storefront wiring: a public lookup endpoint + `permanentRedirect()` in the three dynamic
   routes that exist on this branch today (`legal`, `blog`, `products`). The fourth
   (`/categories/[slug]`) does not exist yet on `develop` — it is TASK-277's deliverable, being
   built in parallel on a different worktree/track ("доріжка A") that merges to `develop`
   **before** this branch does. Wiring that one route is carved out as a separate, explicitly
   deferred **Крок W** (below) rather than attempted against a file that doesn't exist here.

Also folded in, per the source handoff and the owner's follow-up requests: the SEO-health
"thin pages" counter (extends TASK-269/plan 131) and an `llms.txt` hardcode audit.

This is sized larger than the handoff's original "M" — the owner's 2026-07-11 decision to cover
all four content models at once (not just Page/BlogPost) roughly doubles the write-path wiring
work versus the original SEO-10 text. Twelve sub-tasks (`TASK-285-A` … `-L`) plus one explicitly
deferred one (`TASK-285-W`).

## Scope

### In Scope

- Prisma: `SlugRedirectEntity` enum (`PAGE` / `BLOG_POST` / `PRODUCT` / `CATEGORY`) +
  `SlugRedirect` model (`entity`, `oldSlug`, `newSlug`, `createdAt`, `updatedAt` — see Design
  Decision 1 for the `updatedAt` addition), unique on `(entity, oldSlug)`.
- A pure, DB-free **chain-collapse reducer** (`slug-redirect-chain.util.ts`) — the core algorithm,
  build via strict Red→Green→Refactor (`tdd-agent`) against an exhaustive case table (Design
  Decision 2).
- `SlugRedirectRepository` (thin DB executor mirroring the reducer's 3 Prisma statements) +
  `SlugRedirectService` + a **public**, no-auth `GET /api/slug-redirect?entity=&slug=` endpoint
  (new thin module `apps/store-api/src/slug-redirect/`, mirrors the `faq/` module's shape).
- Transactional redirect-recording wired into all four entities' admin **update** flows
  (`PageRepository`/`BlogRepository`/`ProductRepository`/`CategoryRepository`), gated on
  "was publicly visible immediately before this write, and the slug actually changed."
- Admin slug-guard: a `window.confirm()` warning (same idiom already used for every
  delete-confirm in this codebase) in all four `Edit*View` widgets when the slug field changed
  on a currently-live entity, before the update mutation fires.
- Admin delete-guard: extend the existing `deleteConfirm()` dict strings for Page and BlogPost
  (the only two entities with a real hard-delete admin action) to append an "still may be
  indexed" sentence when the row being deleted is currently published.
- Storefront: new `resolveSlugRedirect()` helper + `permanentRedirect()` before the existing
  404 path in `app/legal/[slug]/page.tsx`, `app/blog/[slug]/page.tsx`, and
  `app/products/[slug]/page.tsx`.
- SEO-health extension (TASK-269 / plan 131): two new counts — published pages missing
  `metaDescription`, and published pages with "thin" content (stripped-HTML length < 300 chars)
  — surfaced in `SeoHealthSection`.
- `llms.txt` hardcode audit — read `app/llms.txt/route.ts` end-to-end; fix only if a hardcoded
  per-page slug list is actually found (pre-read during planning found none — see Notes).
- Orval regen (both frontends) after the new public endpoint ships.

### Out of Scope

- **Крок W — `/categories/[slug]` redirect wiring.** That route does not exist in this worktree
  (`apps/store-client/src/app/categories/` currently has only `page.tsx`, the hub — confirmed by
  directory listing during planning). It is TASK-277's deliverable, built on a parallel track
  ("доріжка A") that merges to `develop` **before** this branch. Wiring the redirect check into
  it now would mean writing code against a file this branch doesn't have and that will very
  likely look different once TASK-277/TASK-278 (canonical policy) land. **Everything else
  CATEGORY-related ships now**: the enum member, the transactional redirect-write in
  `CategoryRepository.update()`, and the admin slug-guard on `category-form`. Only the
  storefront-route half is deferred. See §Dependencies & Sequencing for the exact re-entry
  condition.
- Any change to `CategoryRepository.findDescendantIds` / the cycle-detection raw SQL (TASK-238,
  already fixed, unrelated table) — not touched by this plan.
- Deactivating (not deleting) a Product or Category does not get a delete-style warning in this
  plan. Neither entity has a real hard-delete admin action today (`ProductService`/
  `CategoryService` expose only `activate`/`deactivate` + Product's audit-tombstone `delete()`,
  which is never wired to a confirm dialog in the admin UI — confirmed: no
  `window.confirm`/`deleteConfirm` reference exists for products or categories anywhere in
  `apps/store-admin/src`). The rename-guard (item 2 above) still fully applies to both — it's
  only the _delete_-specific warning that is scoped to Page/BlogPost, matching the source handoff
  wording ("видалення опублікованої **сторінки**"). Flagged as a possible small follow-up in
  Notes, not required by this plan.
- Any change to `resolveSeo.ts` / the SERP-preview / canonical-policy work (TASK-268, TASK-278) —
  different files, not touched.
- IndexNow / robots AI-crawler stanza (SEO-6, TASK-282) — separate task.
- A dedicated admin UI to browse/manage the `SlugRedirect` table (view/delete individual
  redirects). Not requested by the source handoff; the table is a pure write-time-derived ledger
  with no admin-facing CRUD in this plan. Flagged in Notes as a plausible future nice-to-have.

## User Stories

1. As the store owner, when I rename a published page's slug in the admin, I want to be warned
   that the old address will stop working and drop out of Google, so I don't do it by accident
   and lose search traffic without knowing.
2. As a shopper who bookmarked or was sent a link to a product/article/page whose slug an admin
   later changed, I want the old link to redirect me straight to the new one instead of showing
   a dead 404 page.
3. As the store owner, when I delete a published page or article, I want a reminder that it might
   still be indexed by Google, so deleting it is a conscious choice, not an accident.
4. As the store owner, I want to see in the SEO-health panel how many of my published pages have
   no meta description or very little content, so I know which ones need more work before they
   look thin to Google.

## Technical Design

### Data Model

```prisma
/// Discriminates which content model a SlugRedirect row belongs to (TASK-285).
enum SlugRedirectEntity {
  PAGE
  BLOG_POST
  PRODUCT
  CATEGORY
}

/// Server-side 301-redirect ledger for admin-renamed content slugs (TASK-285, SEO-10). One row
/// per DEAD alias: `oldSlug` no longer resolves directly for that entity type, and a visitor
/// landing on it should be sent to `newSlug` with a PERMANENT (301) redirect.
///
/// INVARIANT, maintained entirely at write time by `slug-redirect-chain.util.ts` (never at read
/// time): for a given `entity`, no row's `newSlug` ever equals another row's `oldSlug` — every
/// dead alias points DIRECTLY at the entity's CURRENT live slug, never through an intermediate
/// dead one, and a row can never have `oldSlug === newSlug` (a self-redirect). This is what makes
/// the public lookup a single O(1) unique-key read with no chain-walking and — critically — no
/// possibility of a redirect loop, however many times the same entity gets renamed back and
/// forth. See plan 147 §Design Decision 2 for the exact write-time algorithm and its proof.
model SlugRedirect {
  id      String             @id @default(uuid())
  entity  SlugRedirectEntity
  oldSlug String             @map("old_slug")
  newSlug String             @map("new_slug")
  /// Updated whenever a later rename repoints this row (chain collapse) — see Design Decision 1.
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([entity, oldSlug])
  @@index([entity, newSlug])
  @@map("slug_redirects")
}
```

Per the project's Prisma convention (memory: migrations gitignored, `schema.prisma` is the
source of truth): apply with `npx prisma db push` against both the dev DB and `store_test`,
then `npx prisma generate`.

### Design Decision 1 — `updatedAt` added beyond the handoff's literal 3-field spec

The handoff text lists `entity, oldSlug, newSlug, createdAt`. This plan adds `updatedAt` — a
one-line, zero-risk addition matching every other writable model in this schema (`Page`,
`Category`, `Brand`, …), useful for debugging chain-collapse behavior in production (a row whose
`updatedAt` is much later than its `createdAt` was repointed by a later rename, which is exactly
the "alias of an alias" case the algorithm exists to handle correctly). Not a scope change to
the write logic itself.

### Design Decision 2 — the chain-collapse algorithm (the core, TDD'd piece)

**Problem statement.** An entity can be renamed any number of times over its life
(`B → C → D → …`, or renamed back to a slug it used to have). At every rename, the redirect
table must end up in a state where every historical slug points **directly** at the entity's
**current** live slug — never through an intermediate dead slug (a "chain", which would either
require the reader to hop multiple times, or — if the reader naively does one hop — land the
visitor on another dead page instead of the live one). A rename-back-to-a-previous-slug must
never produce a 2-cycle (`B→C` and `C→B` coexisting, an infinite-redirect loop for anyone hitting
either address).

**Algorithm.** For a rename of `entity` from `from` (the slug that just went dead) to `to` (the
new live slug), executed as exactly 3 unconditional writes, in this order, inside one DB
transaction:

1. **Upsert** `(entity, oldSlug: from)` → `newSlug: to` (unique key `(entity, oldSlug)` — create
   if absent, overwrite `newSlug` if present).
2. **Repoint (collapse) the chain**: for every OTHER row of this entity whose `newSlug` currently
   equals `from` (i.e., every historical slug that used to redirect to the now-dead `from`),
   `UPDATE … SET newSlug = to`. This is the collapse step — it is what keeps every alias a single
   hop away from the live slug, no matter how many renames happened.
3. **Delete the self-loop**, if step 2 created one: `DELETE WHERE entity = X AND oldSlug = to AND
newSlug = to`. This specific degenerate row can only be produced by step 2 in exactly one
   case — renaming an entity **back** to a slug it used to redirect away from (see the worked
   trace below) — and it must not persist, because `to` is live again and must not carry a
   (nonsensical) redirect to itself.

No row lookup or branching is needed before running these three statements — they are
unconditionally safe to run on every write that qualifies for redirect-recording (Design
Decision 3 governs _when_ that is). The repository implementation is exactly these 3 Prisma
calls against the transaction client; the **pure reducer** (`slug-redirect-chain.util.ts`,
DB-free, unit-tested) models the identical 3-step transformation over an in-memory row array so
the algorithm itself is exhaustively proven correct before it ever touches Postgres.

**Worked trace — the tricky "rename back" case** (this is _why_ step 3 exists): entity starts at
`B`. Admin renames `B → C`: rows = `[(B,C)]`. Admin later renames back `C → B`
(`from=C, to=B`):

- Step 1 upserts `(C, B)` → rows = `[(B,C), (C,B)]`.
- Step 2 repoints rows where `newSlug = C` → matches `(B,C)` → becomes `(B,B)` → rows =
  `[(B,B), (C,B)]`.
- Step 3 deletes `(oldSlug=B, newSlug=B)` → rows = `[(C,B)]`. ✓ Correct final state: `B` is live
  again (no row redirects away from it), `C` (the abandoned alias) still redirects to `B`.

#### Exhaustive test-case table (drives TASK-285-B's Red→Green→Refactor cycles)

| #   | Existing rows (same entity)                                                                 | Rename (`from → to`)                              | Expected resulting rows                                                                                      | What it proves                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `[]`                                                                                        | `B → C`                                           | `[(B,C)]`                                                                                                    | Fresh first-ever rename                                                                                                                                                |
| 2   | `[(B,C)]`                                                                                   | `C → D`                                           | `[(B,D), (C,D)]`                                                                                             | Simple chain collapse (2-hop history)                                                                                                                                  |
| 3   | `[(B,D), (C,D)]`                                                                            | `D → E`                                           | `[(B,E), (C,E), (D,E)]`                                                                                      | 3-hop history — every alias still lands on the live slug                                                                                                               |
| 4   | `[(B,C)]`                                                                                   | `C → B` (undo)                                    | `[(C,B)]`                                                                                                    | Rename-back — no 2-cycle, self-loop removed (the core proof)                                                                                                           |
| 5   | `[(B,D), (C,D)]`                                                                            | `D → B` (undo further back)                       | `[(B,B)]` before cleanup → `[(C,B)]` after self-loop delete removes only the `oldSlug=to` row; `(B,…)` note: | see detailed sub-trace below (multi-alias undo)                                                                                                                        |
| 6   | `[]`                                                                                        | `X → X` (no-op guard)                             | `[]` (reducer must not create a self row)                                                                    | Defensive: caller-level "slug actually changed" guard should prevent this, but the reducer itself must not blow up or create `(X,X)` if ever called with `from === to` |
| 7   | `[(B,C)]` on entity `PAGE`; `[(B,C)]` on entity `CATEGORY` (same strings, different entity) | `PAGE`: `C → D`                                   | `PAGE` rows become `[(B,D),(C,D)]`; `CATEGORY` rows **unchanged** at `[(B,C)]`                               | Entity isolation — a collision in slug _strings_ across different content types never cross-contaminates                                                               |
| 8   | `[(B,C)]`                                                                                   | `C → C` (defensive, should never happen upstream) | `[(B,C)]` unchanged, no `(C,C)` created                                                                      | Defensive no-op guard, mirrors case 6 for a non-empty starting state                                                                                                   |
| 9   | `[(B,C), (Z,C)]` (two independent aliases both pointing at the same live slug `C`)          | `C → D`                                           | `[(B,D), (Z,D), (C,D)]`                                                                                      | Fan-in collapse — multiple historical aliases converging on one slug all repoint together                                                                              |

Sub-trace for case 5 (multi-alias undo, spelled out): rows `[(B,D), (C,D)]` (both `B` and `C` are
dead aliases of live `D`). Rename `D → B` (`from=D, to=B`):

- Step 1 upserts `(D, B)` → rows = `[(B,D), (C,D), (D,B)]`.
- Step 2 repoints rows where `newSlug = D` → matches `(B,D)` → becomes `(B,B)`; matches `(C,D)` →
  becomes `(C,B)` → rows = `[(B,B), (C,B), (D,B)]`.
- Step 3 deletes `(oldSlug=B, newSlug=B)` → rows = `[(C,B), (D,B)]`. ✓ Both historical aliases (`C`
  and `D`) now correctly redirect to the live slug `B`; no self-loop, no chain.

TASK-285-B's spec file implements all 9 rows as separate `it(...)` cases (case 5 as two
assertions — the intermediate step-2 state is an internal implementation detail, not asserted;
only the final row set is asserted, matching how the reducer is actually consumed).

### Design Decision 3 — visibility gate is evaluated on the PRE-write snapshot

A redirect is recorded if and only if, **immediately before this write**, the entity was
publicly visible **and** the slug is actually changing:

| Entity   | "Publicly visible" gate (pre-write)                                                                                                                                                      | Exact field checked                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Page     | `status === PublishStatus.PUBLISHED`                                                                                                                                                     | mirrors the existing `wasPublished` local already computed in `PageService.update()` |
| BlogPost | `status === PublishStatus.PUBLISHED`                                                                                                                                                     | mirrors the existing `wasPublished` local already computed in `BlogService.update()` |
| Product  | `isActive === true` (and implicitly `deletedAt === null` — `findById` already excludes soft-deleted rows, so any row reaching `update()` is guaranteed live-or-inactive-but-not-deleted) | new local, mirrors the `wasPublished` pattern                                        |
| Category | `isActive === true`                                                                                                                                                                      | new local, mirrors the `wasPublished` pattern                                        |

This matters because `UpdateProductInput`/`UpdateCategoryInput` (unlike Page/BlogPost, which gate
visibility purely through a separate `status`/`publish`/`unpublish` flow) **also** accept an
`isActive` field on the same `update()` call — so a single request could rename the slug _and_
deactivate the entity at once. The gate must use the _pre-write_ `isActive`, not the post-write
one: if it was live before this call, the old URL genuinely was reachable and needs a redirect,
regardless of what the entity becomes afterward in the same request.

### Backend

#### `apps/store-api/src/slug-redirect/` (new module)

- `slug-redirect-chain.util.ts` — the pure reducer:
  `applySlugRename(rows: SlugRedirectRow[], entity: SlugRedirectEntity, from: string, to: string): SlugRedirectRow[]`
  where `SlugRedirectRow = { entity: SlugRedirectEntity; oldSlug: string; newSlug: string }`
  (no id/timestamps — those are DB-layer concerns, irrelevant to the pure transformation).
- `slug-redirect-chain.util.spec.ts` — the 9-case table above (**TDD, `tdd-agent`, strict
  Red→Green→Refactor**).
- `slug-redirect.repository.ts`:
  - `findRedirect(entity, oldSlug): Promise<SlugRedirect | null>` — `prisma.slugRedirect
.findUnique({ where: { entity_oldSlug: { entity, oldSlug } } })`.
  - `recordRename(tx: Prisma.TransactionClient, entity: SlugRedirectEntity, from: string, to:
string): Promise<void>` — the 3 Prisma statements from Design Decision 2, executed against the
    **caller-supplied** `tx` (this repository never opens its own transaction for this method —
    it always runs inside the calling entity-repository's transaction, mirroring the existing
    `discountParam.redeem(created.id, tx)` composition pattern already used in
    `order.repository.ts`).
- `slug-redirect.repository.spec.ts` — unit spec, mocked `PrismaService`/`tx`, asserts the 3
  calls fire with the right arguments (not the algorithm's correctness — that's the pure
  reducer's job).
- `apps/store-api/test/slug-redirect.repository.int-spec.ts` — **real-Postgres** integration
  test (project convention per `category.repository.int-spec.ts` — a live DB is the only thing
  that proves a raw multi-statement write sequence actually behaves as designed; see MEMORY:
  Етап 3 latent `findDescendantIds` bug for why this matters here). Runs every row of the same
  9-case table end-to-end through `recordRename` + a following `findRedirect`, asserting the
  final DB rows exactly match the pure reducer's predicted output for the same inputs — i.e. the
  int-spec's fixtures are generated FROM the same case table as TASK-285-B's unit spec, so the
  two suites can never silently drift apart. Run via `npm run test:int -w apps/store-api`.
- `slug-redirect.service.ts` — `lookup(entity, slug): Promise<{ newSlug: string } | null>`, thin
  pass-through over `findRedirect`.
- `dto/slug-redirect-lookup-query.dto.ts` — `entity: SlugRedirectEntity` (`@IsEnum`, mirrors
  `AdminPageListQueryDto.status`'s enum-validation-message style), `slug: string` (`@IsString
@IsNotEmpty`).
- `entities/slug-redirect-lookup.entity.ts` — `{ newSlug: string }`, `@ApiProperty`.
- `slug-redirect.controller.ts` — **public, no auth** (mirrors `FaqController`'s shape exactly):
  `GET /api/slug-redirect?entity=&slug=` → 200 `{ data: { newSlug } }` when found, 404 when not
  (so the frontend helper's `try { … } catch { return null }` pattern — already used by
  `pages-server.ts`/`blog-server.ts` — works unchanged).
- `slug-redirect.module.ts` — `providers: [SlugRedirectRepository, SlugRedirectService]`,
  `controllers: [SlugRedirectController]`, `exports: [SlugRedirectRepository]` (the four content
  modules import this module and inject `SlugRedirectRepository` directly into their own
  repository's constructor — repository-to-repository DI, no service-layer involvement, no
  import cycle since this module depends on nothing else).
- `index.ts` — barrel, mirrors `faq/index.ts`.
- Registered in `app.module.ts` alongside the other content modules (near `PagesModule`/
  `BlogModule`).

#### Wiring into the four existing repositories (`PageRepository` / `BlogRepository` /

`ProductRepository` / `CategoryRepository`)

Each repository's `update()` gains one new optional parameter,
`slugRename?: { oldSlug: string; newSlug: string }` (the entity discriminator is hardcoded per
repository — `PageRepository` always passes `SlugRedirectEntity.PAGE`, etc. — so callers never
have to supply it). When absent, `update()`'s behavior and SQL are **byte-for-byte unchanged**
from today (no new transaction wrapper on the hot, no-rename path). When present:

```ts
// Page/Blog example (Product/Category identical shape, different Prisma model)
update(id: string, data: UpdatePageInput, slugRename?: { oldSlug: string; newSlug: string }): Promise<Page> {
  if (!slugRename) {
    return this.prisma.page.update({ where: { id }, data: buildData(data) });
  }
  return this.prisma.$transaction(async (tx) => {
    const updated = await tx.page.update({ where: { id }, data: buildData(data) });
    await this.slugRedirectRepository.recordRename(
      tx, SlugRedirectEntity.PAGE, slugRename.oldSlug, slugRename.newSlug,
    );
    return updated;
  });
}
```

Each of the 4 services (`PageService.update` / `BlogService.update` / `ProductService.update` /
`CategoryService.update`) computes the pre-write visibility snapshot (Design Decision 3) and
passes `slugRename` through only when `wasVisible && input.slug !== undefined && input.slug !==
entity.slug`.

**Page-specific fix bundled into the same task (TASK-285-E):** `PageService.update()` today
calls `this.notifyRevalidation(entity.slug)` — purging only the **new** slug's ISR cache tag.
`BlogService.update()` already purges **both** old and new slugs
(`notifyRevalidationForSlugs([post.slug, entity.slug])` when the slug changed). Page never got
the equivalent fix. This matters now: once TASK-285-L ships, hitting the _old_ `/legal/<old>`
route should get a fresh 301 immediately, not a stale ISR-cached render of the old content for
up to the tag's revalidation window. Bringing Page's revalidation in line with Blog's existing
pattern is folded into TASK-285-E as a small, low-risk, in-scope fix (same file already being
touched for the slug-redirect wiring).

### Frontend — Admin (store-admin)

#### Slug-rename guard (all four `Edit*View` widgets)

Each `Edit*View.tsx` (`edit-page-view.tsx`, `edit-blog-post-view.tsx`, `edit-product-view.tsx`,
`edit-category-view.tsx`) already holds the freshly-fetched entity (`page`/`post`/`product`/
`category`) in scope inside `handleSubmit`. The guard is a single `if` block at the top of each
`handleSubmit`, before `update.mutate(...)` — same `window.confirm()` idiom already used for
every delete-confirm in this codebase (`admin-page-table.tsx`, `blog-post-table.tsx`, etc. — no
new UI primitive introduced):

```ts
const handleSubmit = (values: PageFormValues) => {
  const wasLive = page?.status === "PUBLISHED";
  if (wasLive && page && values.slug !== page.slug) {
    if (!window.confirm(dict.pages.slugChangeConfirm(page.slug, values.slug)))
      return;
  }
  update.mutate(/* … unchanged … */);
};
```

Product/Category use `product?.isActive`/`category?.isActive` as the `wasLive` check instead of
`status`.

#### Delete guard (Page + BlogPost only)

`dict.pages.deleteConfirm` / `dict.blogPosts.deleteConfirm` gain a second parameter,
`isPublished: boolean`, appending an extra sentence when `true`. Call sites
(`admin-page-table.tsx`'s `handleDelete`, `blog-post-table.tsx`'s `handleDelete`) already have
`page.isActive` (Page's derived-published mirror) / `post.status` in scope per row — pass it
through.

### Frontend — Storefront (store-client)

- `shared/lib/slug-redirect.ts` (new) — one helper,
  `resolveSlugRedirect(entity: 'PAGE' | 'BLOG_POST' | 'PRODUCT' | 'CATEGORY', slug: string):
Promise<string | null>`, calling the Orval-generated `slugRedirectControllerLookup(...)` function
  directly (see Design Decision 4 for why this is a plain generated call, not a tagged-`fetch`
  wrapper like `pages-server.ts`), wrapped in `try { … } catch { return null }` (mirrors every
  other server-side lookup helper in this codebase).
- `app/legal/[slug]/page.tsx` and `app/blog/[slug]/page.tsx`: immediately before the existing
  `notFound()` call, insert:
  ```ts
  if (!page /* or !entity */) {
    const newSlug = await resolveSlugRedirect(
      "PAGE" /* or 'BLOG_POST' */,
      slug,
    );
    if (newSlug)
      permanentRedirect(`/legal/${newSlug}` /* or `/blog/${newSlug}` */);
    notFound();
  }
  ```
- `app/products/[slug]/page.tsx`: this route has **no existing `notFound()` call** — the 404 UI
  is rendered client-side by `ProductDetailView` (`isError || !data` → not-found state), which
  cannot call the server-only `permanentRedirect()`. Minimal, additive insertion right after the
  existing `const schemas = await buildProductPageSchemas(slug);` line (which already swallows
  any fetch failure — including a genuine 404 — into `null`):
  ```ts
  const schemas = await buildProductPageSchemas(slug);
  if (!schemas) {
    const newSlug = await resolveSlugRedirect("PRODUCT", slug);
    if (newSlug) permanentRedirect(`/products/${newSlug}`);
  }
  ```
  A genuinely dead slug (no redirect row) falls through exactly as today — `ProductDetailView`
  still renders its own not-found state client-side. No other line of the file changes.

### Design Decision 4 — lookup module: separate thin module + plain Orval call, not a tagged-fetch wrapper

Two design questions bundled together, both resolved here:

1. **Backend shape** — a separate thin `src/slug-redirect` module (architect recommendation,
   adopted as-is) with its own public `GET /api/slug-redirect` endpoint, mirroring `faq/`'s
   shape, rather than bolting a redirect-lookup method onto each of the four existing
   public-read services. Rationale: the four content modules would otherwise need to expose an
   identical extra public endpoint each (four near-duplicate controllers), and the lookup is a
   genuinely cross-cutting concern (one enum discriminates the entity) — a single small module
   is the least code and the clearest ownership boundary.
2. **Frontend fetch shape** — the plain Orval-generated Axios call, **not** a tagged
   `next: { fetch, tags }` wrapper like `pages-server.ts`/`blog-server.ts`. Those exist
   specifically so `revalidateTag()` can purge an ISR cache entry for content that's rendered
   repeatedly and expensively. A slug-redirect lookup is the opposite shape: it fires only on the
   rare path where the primary content fetch has ALREADY failed (a 404 candidate), it must always
   reflect the live DB (a stale "no redirect" answer would strand a visitor on a 404 for up to
   the cache window), and Axios already bypasses Next's patched `fetch` cache entirely by
   default — giving "always fresh" for free, which is exactly the desired behavior here. No new
   ISR tag, no `RevalidationNotifier` involvement for this endpoint.

### API Contract

| Method | Path                 | Auth             | Query / Body                                                 | Response                                   |
| ------ | -------------------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------ |
| GET    | `/api/slug-redirect` | Public (no auth) | `?entity=PAGE\|BLOG_POST\|PRODUCT\|CATEGORY&slug=<old-slug>` | 200 `{ data: { newSlug: string } }` or 404 |

No changes to any existing endpoint's request shape — the four `PUT /api/admin/{pages,blog/
posts,products,categories}/:id` endpoints are unchanged (the redirect-recording is entirely
internal to the existing `slug` field already accepted on all four).

## Tasks

### TASK-285-A: Prisma schema — `SlugRedirectEntity` enum + `SlugRedirect` model

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No (schema-only).
**Depends on:** —

**Acceptance Criteria:**

- [ ] `SlugRedirectEntity` enum + `SlugRedirect` model added to `schema.prisma` exactly per
      §Data Model (doc comments included — they carry the invariant explanation future readers
      need).
- [ ] Applied via `npx prisma db push` to the dev DB **and** `store_test`, followed by
      `npx prisma generate`.
- [ ] `npm run typecheck -w apps/store-api` clean (new Prisma Client types compile).

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — new enum + model

---

### TASK-285-B: Chain-collapse pure reducer (TDD, `tdd-agent`)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** **Yes — strict Red→Green→Refactor, `tdd-agent`.** This is the one piece of
genuinely tricky, cycle-prone business logic in the whole plan; everything else is either
schema/plumbing or a straightforward gate-and-pass-through.
**Depends on:** TASK-285-A (needs the `SlugRedirectEntity` enum type).

**Acceptance Criteria:**

- [ ] `applySlugRename(rows, entity, from, to)` implemented exactly per §Design Decision 2's
      3-step algorithm, operating on a plain in-memory array (no Prisma import in this file).
- [ ] All 9 cases from the exhaustive test-case table implemented as separate `it(...)` blocks in
      `slug-redirect-chain.util.spec.ts`, written and RED **before** the implementation exists
      (Red→Green→Refactor discipline — commit history or PR description should show this, per
      the `tdd` skill).
- [ ] Case 4 (rename-back / undo) and case 5 (multi-alias undo) specifically assert the absence
      of a self-loop row (`oldSlug === newSlug`) and the absence of any 2-cycle (no pair of rows
      `(X,Y)` and `(Y,X)` coexisting) in the final state.
- [ ] Case 7 (entity isolation) asserts the OTHER entity's row array is returned completely
      unchanged (`toEqual` on the untouched array, proving no cross-entity mutation).
- [ ] Tests pass: `npm run test -w apps/store-api` (new suite green).
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/slug-redirect/slug-redirect-chain.util.ts` — new
- `apps/store-api/src/slug-redirect/slug-redirect-chain.util.spec.ts` — new, 9-case table

---

### TASK-285-C: `SlugRedirectRepository` + real-Postgres integration test

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No for the repository wrapper itself (it is a direct, mechanical translation of
the already-TDD'd reducer into 3 Prisma statements) — but the **integration test is mandatory**
per project convention (raw/multi-statement writes have bitten this repo before — MEMORY: Етап 3
latent `findDescendantIds` bug — a live DB is the only thing that proves the statements do what
the reducer says they should).
**Depends on:** TASK-285-B (mirrors its algorithm 1:1; the int-spec's fixtures are generated from
the same 9-case table).

**Acceptance Criteria:**

- [ ] `SlugRedirectRepository.findRedirect(entity, oldSlug)` and `.recordRename(tx, entity, from,
  to)` implemented exactly per §Backend.
- [ ] `slug-redirect.repository.spec.ts` (mocked `tx`) asserts `recordRename` issues exactly the
      3 calls (`upsert`, `updateMany`, `deleteMany`) with the documented `where`/`data` shapes,
      in order.
- [ ] `apps/store-api/test/slug-redirect.repository.int-spec.ts` (new, real Postgres, mirrors
      `category.repository.int-spec.ts`'s scaffolding — `ConfigModule.forRoot` +
      `PrismaService`/`SlugRedirectRepository` providers, `DATABASE_URL` test-DB guard): runs all
      9 case-table scenarios end-to-end (seed rows via `prisma.slugRedirect.createMany`, call
      `recordRename`, read back via `findRedirect`/`findMany`, assert against the same expected
      final-state rows as the unit reducer spec).
- [ ] `npm run test:int -w apps/store-api` green (9/9 int-spec cases).
- [ ] `npm run test -w apps/store-api` green (unit spec, no regressions).
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/slug-redirect/slug-redirect.repository.ts` — new
- `apps/store-api/src/slug-redirect/slug-redirect.repository.spec.ts` — new
- `apps/store-api/test/slug-redirect.repository.int-spec.ts` — new

---

### TASK-285-D: `SlugRedirectService` + public `SlugRedirectModule`/`SlugRedirectController`

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-285-C.

**Acceptance Criteria:**

- [ ] `SlugRedirectService.lookup(entity, slug)` + `dto/slug-redirect-lookup-query.dto.ts` +
      `entities/slug-redirect-lookup.entity.ts` + `slug-redirect.controller.ts` (public, no auth
      guard) + `slug-redirect.module.ts` (`exports: [SlugRedirectRepository]`) + `index.ts`
      barrel, all per §Backend.
- [ ] `GET /api/slug-redirect?entity=PAGE&slug=missing` → 404 when no row exists; → 200
      `{ data: { newSlug } }` when one does.
- [ ] Invalid `entity` value → 400 (class-validator `@IsEnum` rejection, mirrors
      `AdminPageListQueryDto.status`'s error-message style).
- [ ] Registered in `app.module.ts` alongside the other content modules.
- [ ] Unit tests: `slug-redirect.service.spec.ts`, `slug-redirect.controller.spec.ts` (standard
      coverage, not full TDD).
- [ ] `npm run swagger:export -w apps/store-api` run locally so the new endpoint appears in the
      OpenAPI spec (regenerated `swagger.json` not committed — gitignored, same as every other
      contract change in this repo).
- [ ] Tests pass: `npm run test -w apps/store-api`.
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/slug-redirect/slug-redirect.service.ts` — new
- `apps/store-api/src/slug-redirect/slug-redirect.service.spec.ts` — new
- `apps/store-api/src/slug-redirect/slug-redirect.controller.ts` — new
- `apps/store-api/src/slug-redirect/slug-redirect.controller.spec.ts` — new
- `apps/store-api/src/slug-redirect/dto/slug-redirect-lookup-query.dto.ts` — new
- `apps/store-api/src/slug-redirect/entities/slug-redirect-lookup.entity.ts` — new
- `apps/store-api/src/slug-redirect/slug-redirect.module.ts` — new
- `apps/store-api/src/slug-redirect/index.ts` — new
- `apps/store-api/src/app.module.ts` — register `SlugRedirectModule`

---

### TASK-285-E: Wire redirect-recording into Page write path (+ revalidation fix)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No (gate-and-pass-through over already-TDD'd pieces).
**Depends on:** TASK-285-D (needs `SlugRedirectRepository` importable).

**Acceptance Criteria:**

- [ ] `PagesModule` imports `SlugRedirectModule`; `PageRepository` constructor injects
      `SlugRedirectRepository`.
- [ ] `PageRepository.update()` gains the optional `slugRename` param exactly per §Backend's
      example; behavior/SQL unchanged when omitted (regression-tested by the existing spec suite
      still passing unmodified for the no-rename cases).
- [ ] `PageService.update()` computes `wasPublished` (already exists) and passes `slugRename =
  { oldSlug: page.slug, newSlug: dto.slug }` to the repository only when `wasPublished &&
  dto.slug !== undefined && dto.slug !== page.slug`.
- [ ] **Revalidation fix**: `PageService.update()`'s post-write revalidation call purges **both**
      the old and the new slug's cache tags/paths when the slug changed (mirrors
      `BlogService.update()`'s existing `notifyRevalidationForSlugs([post.slug, entity.slug])`
      pattern) — not just the new slug as today.
- [ ] New unit tests in `pages.service.spec.ts` / `pages.repository.spec.ts`: renaming a
      published page's slug records a redirect (mocked `SlugRedirectRepository.recordRename`
      called with the right args) and purges both old+new revalidation targets; renaming a
      **draft** page's slug does NOT call `recordRename`; renaming a published page's title only
      (slug unchanged) does NOT call `recordRename`.
- [ ] Tests pass: `npm run test -w apps/store-api`.
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/pages/pages.module.ts` — import `SlugRedirectModule`
- `apps/store-api/src/pages/pages.repository.ts` — `slugRename` param, `SlugRedirectRepository`
  injection
- `apps/store-api/src/pages/pages.service.ts` — gate + pass-through + revalidation fix
- `apps/store-api/src/pages/pages.repository.spec.ts` — new cases
- `apps/store-api/src/pages/pages.service.spec.ts` — new cases

---

### TASK-285-F: Wire redirect-recording into BlogPost write path

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-285-D.

**Acceptance Criteria:** (mirrors TASK-285-E exactly, no revalidation fix needed — Blog's
already correct)

- [ ] `BlogModule` imports `SlugRedirectModule`; `BlogRepository` injects `SlugRedirectRepository`.
- [ ] `BlogRepository.update()` gains the optional `slugRename` param; unchanged behavior when
      omitted.
- [ ] `BlogService.update()` passes `slugRename` only when `wasPublished && dto.slug !==
  undefined && dto.slug !== post.slug`.
- [ ] New unit tests mirroring TASK-285-E's three cases (published+renamed records a redirect;
      draft+renamed does not; published+unchanged-slug does not).
- [ ] Tests pass: `npm run test -w apps/store-api`.
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/blog/blog.module.ts` — import `SlugRedirectModule`
- `apps/store-api/src/blog/blog.repository.ts` — `slugRename` param, injection
- `apps/store-api/src/blog/blog.service.ts` — gate + pass-through
- `apps/store-api/src/blog/blog.repository.spec.ts` — new cases
- `apps/store-api/src/blog/blog.service.spec.ts` — new cases

---

### TASK-285-G: Wire redirect-recording into Product write path

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-285-D.

**Acceptance Criteria:**

- [ ] `ProductModule` imports `SlugRedirectModule`; `ProductRepository` injects
      `SlugRedirectRepository`.
- [ ] `ProductRepository.update()` gains the optional `slugRename` param; unchanged behavior when
      omitted.
- [ ] `ProductService.update()` captures `wasActive = product.isActive` **before** building the
      update input (per §Design Decision 3 — the pre-write snapshot, independent of whether this
      same call also flips `isActive`), and passes `slugRename` only when `wasActive &&
  input.slug !== undefined && input.slug !== product.slug`.
- [ ] Explicitly verified: `ProductService.delete()` (the audit-tombstone soft-delete, which
      mangles the slug via `deleted:<id>:<slug>` and never calls `repository.update()`) does
      **not** go through this path and never records a redirect to a mangled slug — confirmed by
      a test asserting `SlugRedirectRepository.recordRename` is never called from `delete()`.
- [ ] New unit tests mirroring TASK-285-E's three cases, plus: renaming AND deactivating an
      active product in the same `update()` call still records the redirect (pre-write snapshot
      rule).
- [ ] Tests pass: `npm run test -w apps/store-api`.
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/product/product.module.ts` — import `SlugRedirectModule`
- `apps/store-api/src/product/product.repository.ts` — `slugRename` param, injection
- `apps/store-api/src/product/product.service.ts` — `wasActive` gate + pass-through
- `apps/store-api/src/product/product.repository.spec.ts` — new cases
- `apps/store-api/src/product/product.service.spec.ts` — new cases

---

### TASK-285-H: Wire redirect-recording into Category write path

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-285-D.

**Acceptance Criteria:** (mirrors TASK-285-G)

- [ ] `CategoryModule` imports `SlugRedirectModule`; `CategoryRepository` injects
      `SlugRedirectRepository`.
- [ ] `CategoryRepository.update()` gains the optional `slugRename` param; unchanged behavior
      when omitted.
- [ ] `CategoryService.update()` captures `wasActive = category.isActive` before building the
      update input, passes `slugRename` only when `wasActive && input.slug !== undefined &&
  input.slug !== category.slug`.
- [ ] New unit tests mirroring TASK-285-E's three cases, plus the same simultaneous
      rename+deactivate case as TASK-285-G.
- [ ] Tests pass: `npm run test -w apps/store-api`.
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/category/category.module.ts` — import `SlugRedirectModule`
- `apps/store-api/src/category/category.repository.ts` — `slugRename` param, injection
- `apps/store-api/src/category/category.service.ts` — `wasActive` gate + pass-through
- `apps/store-api/src/category/category.repository.spec.ts` — new cases
- `apps/store-api/src/category/category.service.spec.ts` — new cases

---

### TASK-285-I: Admin slug-rename guard (4 forms) + delete-guard (Page/BlogPost)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — covered by component tests below.
**Depends on:** — (pure frontend UX change over already-fetched entity state; does not need the
backend redirect table to exist to be built/tested, but should land after TASK-285-E/F/G/H so a
warned-and-confirmed rename actually gets a redirect recorded server-side. Sequenced after them
in this plan for that reason, not a hard technical dependency.)

**Acceptance Criteria:**

- [ ] `dict.pages.slugChangeConfirm(oldSlug, newSlug)`, `dict.blogPosts.slugChangeConfirm(...)`,
      `dict.products.slugChangeConfirm(...)`, `dict.categories.slugChangeConfirm(...)` — new
      dict functions, plain-UA copy along the lines of: "Ви змінюєте адресу опублікованої
      сторінки з «{old}» на «{new}». Стара адреса перестане працювати і випаде з результатів
      пошуку Google — але ми автоматично налаштуємо переадресацію зі старої адреси на нову.
      Продовжити?" (Product/Category copy says "активного товару"/"активної категорії" instead
      of "опублікованої сторінки", no URL-path prefix assumed for Category since its storefront
      route does not exist on this branch yet — see Крок W).
- [ ] `edit-page-view.tsx`, `edit-blog-post-view.tsx`, `edit-product-view.tsx`,
      `edit-category-view.tsx`: `handleSubmit` gains the `wasLive`/slug-changed guard exactly per
      §Frontend — Admin, calling `window.confirm(...)` and returning early (no mutation fired) on
      cancel.
- [ ] `dict.pages.deleteConfirm` / `dict.blogPosts.deleteConfirm` gain a second `isPublished:
  boolean` parameter; when `true`, append: " Сторінка опублікована і може бути в
      пошуковому індексі Google — після видалення адреса поверне помилку 404 без переадресації."
      (analogous copy for `blogPosts`, "стаття"/"опублікована").
- [ ] `admin-page-table.tsx`'s `handleDelete` passes `page.isActive` as the new arg;
      `blog-post-table.tsx`'s `handleDelete` passes `post.status === "PUBLISHED"`.
- [ ] New/updated tests: `edit-page-view.test.tsx` (or equivalent) — submitting an unchanged slug
      on a published page never calls `window.confirm`; changing the slug on a published page
      calls `window.confirm` and, on cancel (mocked `false`), never calls the update mutation; on
      confirm (mocked `true`), the mutation fires as before. Same pattern replicated for the
      other 3 edit views. `admin-page-table.test.tsx` / `blog-post-table.test.tsx`: delete-confirm
      copy includes the extra sentence only when the row is published.
- [ ] Tests pass: `npm run test -w apps/store-admin`.
- [ ] `npm run typecheck -w apps/store-admin` / `npm run lint -w apps/store-admin` clean.

**Files to create/modify:**

- `apps/store-admin/src/shared/config/dictionary.ts` — new `slugChangeConfirm` keys (×4), updated
  `deleteConfirm` signatures (×2)
- `apps/store-admin/src/widgets/page-form-view/ui/edit-page-view.tsx`
- `apps/store-admin/src/widgets/blog-post-form-view/ui/edit-blog-post-view.tsx`
- `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx`
- `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx`
- `apps/store-admin/src/widgets/page-list/ui/admin-page-table.tsx`
- `apps/store-admin/src/widgets/blog-post-list/ui/blog-post-table.tsx`
- corresponding `*.test.tsx` files for all of the above

---

### TASK-285-J: SEO-health "thin pages" counters (extends TASK-269 / plan 131)

**Type:** feat
**Scope:** store-api, store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — covered by unit + e2e tests below (the raw-SQL length check gets
real-Postgres coverage via the e2e suite per project convention, mirroring how
`seo-settings.e2e-spec.ts` already exercises this module end-to-end rather than via a dedicated
int-spec).
**Depends on:** — (independent of the rest of this plan; can land any time; sequenced last
among the backend tasks purely to keep the PR/review focused).

**Acceptance Criteria:**

- [ ] `ContentSeoCounts` gains `pagesMissingMetaDescription: number` and `pagesThinContent:
  number`.
- [ ] `SeoSettingsRepository.getContentSeoCounts()`: `pagesMissingMetaDescription` = `prisma.page
  .count({ where: { status: PUBLISHED, metaDescription: null } })` (mirrors the existing
      `metaTitle: null` check's null-only convention — no `OR [null, '']` broadening, staying
      consistent with the sibling counts already in this method).
- [ ] `pagesThinContent` computed via a raw query (Prisma has no string-length filter operator):
      `sql
  SELECT COUNT(*)::bigint AS count FROM pages
  WHERE status = 'PUBLISHED'
    AND length(regexp_replace(content, '<[^>]*>', '', 'g')) < 300
  `
      via `this.prisma.$queryRaw` tagged template (no interpolated values — constant query, no
      injection surface), cast `bigint` → `number`.
- [ ] `SeoHealthEntity` gains the two new fields (`@ApiProperty`), mapped in `fromCounts()`.
- [ ] `seo-settings.repository.spec.ts` / `seo-settings.service.spec.ts`: mocked count/raw-query
      results, new fields pass through `fromCounts()` correctly.
- [ ] `seo-settings.e2e-spec.ts` (real Postgres via the existing e2e harness): seed a published
      page with no `metaDescription` and short content, another with both filled and long
      content; `GET /api/admin/seo-settings/health` reflects the counts correctly (proves the
      raw SQL against a real DB, per the project's raw-SQL-needs-a-live-DB convention).
- [ ] `SeoHealthSection.tsx`: two new `AutoRow`s ("Сторінки без SEO-опису", "Сторінки з
      неповним вмістом (< 300 символів)"), same neutral/informational tone as the three existing
      rows, same `/pages` link target.
- [ ] `dictionary.ts` (`seoHealth`): new `pagesMissingDescriptionLabel`,
      `pagesThinContentLabel` keys.
- [ ] `seo-health-section.test.tsx`: new cases for the two rows (loading/error/populated states,
      mirroring the existing 3-row test coverage).
- [ ] Orval regen (`npm run generate:api`) so `SeoHealthEntity`'s new fields compile in
      store-admin; not committed (gitignored).
- [ ] Tests pass: `npm run test -w apps/store-api`, `npm run test -w apps/store-admin`.
- [ ] `npm run typecheck` / `npm run lint` clean in both workspaces.

**Files to create/modify:**

- `apps/store-api/src/seo-settings/seo-settings.repository.ts` — `ContentSeoCounts` fields, raw
  query
- `apps/store-api/src/seo-settings/entities/seo-health.entity.ts` — new fields
- `apps/store-api/src/seo-settings/seo-settings.repository.spec.ts` — new cases
- `apps/store-api/src/seo-settings/seo-settings.service.spec.ts` — new cases
- `apps/store-api/test/seo-settings.e2e-spec.ts` — new health-count cases
- `apps/store-admin/src/widgets/seo-settings-view/ui/seo-health-section.tsx` — two new rows
- `apps/store-admin/src/widgets/seo-settings-view/ui/seo-health-section.test.tsx` — new cases
- `apps/store-admin/src/shared/config/dictionary.ts` — new `seoHealth.*` keys

---

### TASK-285-K: `llms.txt` hardcode audit (verification-only, no diff expected)

**Type:** docs / chore
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `app/llms.txt/route.ts` re-read end-to-end. **Pre-read during planning found no hardcoded
      per-page slug list** — the file's "Основні розділи"/"Інформація та підтримка" sections
      link only to top-level hub routes (`/products`, `/categories`, `/blog`, `/promo`, `/info`,
      `/legal`, `/contact`), never to an individual Page's `/legal/<slug>`. The only
      admin-editable piece is `SeoSettings.llmsTxtSummary` (the intro paragraph), already
      dynamic. **If this task's fresh read confirms the same, no code changes are made** —
      the acceptance criterion is the confirmation itself, documented in the PR description /
      commit message.
- [ ] IF a hardcoded per-page slug is found (unexpected — contradicts the pre-read above),
      replace it with a line generated from `fetchPublishedPages()` (already imported by
      `pages-server.ts`, reused directly), sorted by `sortOrder`, and add this as an explicit new
      acceptance criterion at implementation time.
- [ ] No test changes expected under the "no hardcode found" outcome; if code changes are made,
      extend whatever test coverage `llms.txt`'s route already has (none currently — a new
      lightweight route test would be added in that branch only).

**Files to create/modify:**

- None expected. `apps/store-client/src/app/llms.txt/route.ts` only if the audit finds an actual
  hardcode (see above).

---

### TASK-285-L: Storefront redirect wiring (`legal`, `blog`, `products`)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No — covered by route tests below.
**Depends on:** TASK-285-D (needs the public endpoint to exist and be Orval-generatable).

**Acceptance Criteria:**

- [ ] `npm run generate:api -w apps/store-client` run locally so
      `slugRedirectControllerLookup(...)` exists in generated output (not committed, gitignored).
- [ ] `shared/lib/slug-redirect.ts`: `resolveSlugRedirect(entity, slug)` exactly per §Frontend —
      Storefront / Design Decision 4.
- [ ] `app/legal/[slug]/page.tsx`, `app/blog/[slug]/page.tsx`: `permanentRedirect()` inserted
      before the existing `notFound()` exactly per §Frontend — Storefront; no other line of
      either file's existing logic (metadata resolution, related-posts fetch, JSON-LD) touched.
- [ ] `app/products/[slug]/page.tsx`: the additive `if (!schemas) { … }` block inserted right
      after `buildProductPageSchemas(slug)`'s existing call, per §Frontend — Storefront; no other
      line changed; `ProductDetailView`'s own client-side not-found handling is completely
      untouched (still the fallback for genuinely dead slugs with no redirect row).
- [ ] `page.test.ts` (legal) / new/extended route tests for blog and products: a slug with an
      existing `SlugRedirect` row (mocked `resolveSlugRedirect` resolving to a new slug) results
      in `permanentRedirect` being called with the expected new URL (mock `next/navigation`'s
      `permanentRedirect`, assert it throws — Next's real implementation throws a special
      redirect signal, so the test mocks it to a `jest.fn()` and asserts the call, following
      whatever mocking pattern this repo's existing `notFound()` tests already use for the
      sibling case); a slug with NO redirect row still 404s exactly as before (regression case).
- [ ] Manual check: with a real API running and a `SlugRedirect` row seeded, hitting the old
      `/legal/<old-slug>` URL returns an HTTP 308 (`permanentRedirect` uses 308, not 301, in
      Next's implementation — verified against Next's own docs/type, not assumed) to the new URL.
- [ ] Tests pass: `npm run test -w apps/store-client`.
- [ ] `npm run typecheck -w apps/store-client` / `npm run lint -w apps/store-client` /
      `npm run build -w apps/store-client` clean.

**Files to create/modify:**

- `apps/store-client/src/shared/lib/slug-redirect.ts` — new
- `apps/store-client/src/shared/lib/slug-redirect.test.ts` — new
- `apps/store-client/src/app/legal/[slug]/page.tsx`
- `apps/store-client/src/app/legal/[slug]/page.test.ts` — new cases
- `apps/store-client/src/app/blog/[slug]/page.tsx`
- `apps/store-client/src/app/blog/[slug]/page.test.ts` — new (or extended, if one already exists
  beyond what was read during planning — verify at implementation time)
- `apps/store-client/src/app/products/[slug]/page.tsx`
- `apps/store-client/src/app/products/[slug]/page.test.ts` — new (or extended)

---

### TASK-285-W: [DEFERRED] `/categories/[slug]` redirect wiring

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h) — once unblocked, this is a small, mechanical repeat of TASK-285-L's
`legal`/`blog` pattern (assuming TASK-277 ships a server component that calls `notFound()`
directly, matching the other two hub routes rather than the products route's client-delegated
shape — **re-verify this assumption once TASK-277 actually lands**, since its exact 404 shape is
not yet known from this worktree).
**TDD Required:** No.
**Depends on:** TASK-277 (`/categories/[slug]` SSR route — not started as of this plan, being
built on a parallel worktree/track, merges to `develop` before this branch) **and** a rebase of
this branch onto `develop` after that merge.

**NOT implemented as part of this plan.** Explicitly carved out per the task brief: this route
does not exist in this worktree today (confirmed: `apps/store-client/src/app/categories/`
contains only the hub `page.tsx`, no `[slug]/` subdirectory). Building against a route another
in-flight track owns would either conflict on merge or be written against a shape that changes
before it lands. The CATEGORY half of everything backend-side (enum member, transactional
redirect-write in `CategoryRepository.update()`, admin slug-guard in `category-form`) ships now
in TASK-285-A/H/I — only the storefront-route half waits.

**Re-entry checklist (for whoever picks this up after TASK-277 merges):**

- [ ] Confirm `app/categories/[slug]/page.tsx` exists on `develop` and read its actual 404
      shape (does it call `notFound()` directly in a server component, like `legal`/`blog`? Or
      delegate to a client component, like `products`? This determines which of TASK-285-L's two
      insertion patterns to copy.)
- [ ] Add the `permanentRedirect()` check using the already-shipped `resolveSlugRedirect('CATEGORY', slug)` helper (TASK-285-L, already in `shared/lib/slug-redirect.ts` — reused as-is, not
      reimplemented).
- [ ] Add the equivalent route test (redirect-row case + no-row regression case), mirroring
      TASK-285-L's test pattern.
- [ ] No backend change needed at this point — `CATEGORY` is already a fully wired
      `SlugRedirectEntity` member with its own admin guard and transactional writes since
      TASK-285-A/H/I.

## Dependencies & Sequencing

- **Internal:** `A → B → C → D → {E, F, G, H in any order} → I` (I sequenced after E-H so a
  confirmed rename in the admin actually persists a redirect end-to-end, though not a hard
  technical blocker). `D → L`. `J` and `K` are fully independent of the rest of this plan and can
  land in any order relative to A-I/L. `W` is blocked on an external merge (TASK-277) + a rebase
  of this branch, not on anything else in this plan.
- **External / доріжка B Етапу 7:** this is the third and final task on доріжка B
  (`SEO-3/TASK-279 → SEO-4/TASK-280 → SEO-10/TASK-285`), same branch/worktree as the other two
  (already committed there). No file overlap with either: TASK-279 touched `app/layout.tsx` +
  brand assets; TASK-280 touched `SeoSettings`'s two verification columns + the same
  `app/layout.tsx` function (sequenced after 279 specifically to avoid a diff conflict there).
  This plan's `schema.prisma` touch is a new model, not a new field on `SeoSettings` — no overlap
  with either prior task's schema change.
- **External / доріжка A (parallel worktree):** TASK-277 (`/categories/[slug]` SSR route) and
  TASK-278 (canonical policy) are being built on a separate track that merges to `develop`
  **before** this branch. Everything in this plan except Крок W is independent of that work (no
  shared files — confirmed: `resolveSeo.ts`, `app/products/page.tsx` listing/canonical logic, and
  `app/categories/page.tsx` hub are all untouched by this plan). Крок W is the sole re-entry point
  once TASK-277 lands and this branch rebases.

## Risks & Mitigations

| Risk                                                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The chain-collapse algorithm has a subtle bug in a case not covered by the 9-row table (e.g. a very long rename history, 5+ hops)                                                                   | The algorithm's correctness argument (Design Decision 2) generalizes inductively from the 3-hop case (row 3) — each rename only ever touches rows whose `newSlug` currently equals the just-abandoned `from`, so the invariant "no row's `newSlug` equals another row's `oldSlug`" is preserved by construction at every step, not just for the specific rows in the table. The table exists to prove the _base cases and the one genuinely tricky case (undo)_, not to enumerate every possible history length. Flagged for a property-based/randomized follow-up test if a bug is ever found in production. |
| A concurrent rename of the same entity from two admin sessions races inside the `$transaction`, corrupting the redirect chain                                                                       | Prisma's `$transaction` uses the DB's default isolation level (READ COMMITTED on Postgres); the `updateMany`/`deleteMany` steps are set-based and idempotent-safe under normal concurrent-write serialization by Postgres row locks on the `update()` call itself (the entity row is locked for the duration of the transaction). Two admins racing to rename the _same_ entity is an existing, unrelated race (whichever `update()` commits second wins, same as today, pre-this-plan) — not a new risk this plan introduces.                                                                                |
| The `products/[slug]/page.tsx` insertion point (`if (!schemas) { … }`) also fires the redirect lookup on a transient network error (not just a genuine 404), wasting one extra request              | Acceptable: `resolveSlugRedirect` itself degrades to `null` on any error (same `try/catch` idiom as every other server-side lookup here), so a transient error just means one extra fast local-network round-trip before falling through to the existing (unchanged) not-found behavior — no user-visible regression, no infinite loop, no wrong redirect.                                                                                                                                                                                                                                                    |
| Admin renames a slug, cancels the `window.confirm()`, but the underlying form state now shows the new (unsaved) slug value, confusing the admin about what will actually be saved on a later submit | Existing, unrelated RHF behavior (canceling the confirm only blocks the mutation call, not the input's local value) — out of scope for this plan; same UX shape as every other `window.confirm`-gated action in this codebase (e.g., delete-confirm doesn't restore any state either, since delete has no "undo the input" concept). Flagged, not fixed — a `reset()`-on-cancel would be a small, separate, low-priority polish item if the owner wants it later.                                                                                                                                             |
| Raw SQL for the "thin content" count (`regexp_replace`/`length`) has a table/column-name typo that only a live DB catches (the exact TASK-238 failure mode)                                         | Covered by `seo-settings.e2e-spec.ts` against the real e2e Postgres DB (project convention), not just a mocked unit spec — the mismatch class of bug that bit `CategoryRepository` is exactly what this test guards against.                                                                                                                                                                                                                                                                                                                                                                                  |

## Notes

- **Sequencing note (for the orchestrator):** this is the third and final доріжка-B task in
  worktree `store-ai-wt-b`. TASK-279 (plan 145) and TASK-280 (plan 146) are already committed
  there. This plan (147) is the last one on this branch before it's ready to merge — Крок W is
  the sole intentionally-unfinished piece, blocked on an external merge from доріжка A.
- **Possible future follow-up (not part of this plan):** a delete-warning for Product/Category
  mirroring the Page/BlogPost one, if the owner later adds a real hard-delete admin action for
  either (today both only support reversible `activate`/`deactivate`, which this plan
  deliberately does not touch — see §Out of Scope).
- **Possible future follow-up (not part of this plan):** a small admin UI to browse/manually
  delete individual `SlugRedirect` rows (e.g. for a rename the admin wants to explicitly NOT
  redirect, such as reusing an old slug for unrelated new content). Not requested by the source
  handoff; the table is currently a pure write-time-derived, read-only-from-the-admin's-
  perspective ledger.
- The exact HTTP status Next's `permanentRedirect()` emits (308, confirmed against Next's own
  type/doc surface, not assumed) matters for TASK-285-L's manual-check acceptance criterion —
  308 (not 301) is the modern equivalent that preserves the request method, which is what Next
  uses for both `redirect()` (307) and `permanentRedirect()` (308) by design.

## Review follow-up (2026-07-11, pre-merge)

- **True HTTP 308 on `/legal/[slug]` and `/products/[slug]`:** code review caught that both
  routes had a route-level `loading.tsx`, whose implicit Suspense boundary makes Next stream a
  200 shell **before** `permanentRedirect()`/`notFound()` runs — degrading the redirect to a
  client-side RSC navigation (bots see 200). Fixed by deleting both `loading.tsx` files, same
  as the `/categories/[slug]` precedent (доріжка A). Skeleton UX is preserved: the PDP keeps
  its in-page `<Suspense fallback={<ProductDetailSkeleton />}>` (redirect decision runs before
  any boundary); the legal page server-fetches its content before render, so it needs no inner
  Suspense. The stale "/legal/[slug] has that flaw" comment in `categories/[slug]/page.tsx` was
  updated. Live `curl -I` check for all 4 routes added to `docs/manual-qa-pending.md`.
- **`@MaxLength(255)` on the public lookup DTO:** `SlugRedirectLookupQueryDto.slug` now caps at
  255 chars (repo convention for slug fields), with `maxLength` on the Swagger property and a
  DTO validation spec; API spec re-exported and Orval hooks regenerated.
