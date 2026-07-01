# Plan 095 — Full-text search + header autocomplete (Meilisearch) — TASK-075

> **Wave 4 (dedicated session).** The single largest remaining Tier-4 feature. Adds a typo-tolerant
> search engine (Meilisearch) behind a `/search` results page + an inline header autocomplete
> dropdown, replacing the slow Prisma `LIKE`/`contains` scan for the search path. Follows the
> **Nova Poshta external-client pattern** (thin wrapper, `isConfigured()` gate, graceful
> degradation, mocked-client e2e, live check deferred to manual QA). **No Prisma model / no
> migration** — the search index lives entirely in Meilisearch.

## Problem

Product search today is `product.repository.ts` doing `name/description contains (insensitive)`
in Postgres. It is slow at scale, does **not** tolerate typos ("афйон" → "айфон"), has no ranking
/ relevance, and there is **no header search box** at all (search only exists as a `?search=`
param on the catalog list page). requirements.md explicitly calls for Meilisearch-class search.

## Goal

1. **Engine:** run Meilisearch (Docker) holding a `products` index of active products.
2. **Backend `SearchModule`:** a thin `MeiliClient` wrapper + `SearchService` (index lifecycle,
   document sync, query) + `SearchController` (`GET /api/search` results + `GET /api/search/suggest`
   autocomplete, public + throttled) + admin `POST /api/admin/search/reindex`.
3. **Index sync:** keep the index in step with product mutations (create/update/activate/
   deactivate/delete) — best-effort, never blocking the write; plus a full reindex for
   bootstrap/drift recovery.
4. **Frontend:** inline header **autocomplete** (debounced, a11y, keyboard nav) + a `/search?q=`
   results page (reuses `ProductCard`).
5. **Graceful degradation:** when Meilisearch is not configured/reachable, `/search` transparently
   **falls back to the existing Postgres search** so the storefront keeps working with no engine.

Non-goals: faceted filtering UI, synonyms/stop-word curation beyond sane defaults, search
analytics, indexing categories/pages (products only for MVP), a transactional search outbox
(best-effort sync + reindex endpoint is the MVP; a `search_outbox` is a documented follow-up).

## Infrastructure

| File                           | Change                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker-compose.yml`           | add `meilisearch` service (`getmeili/meilisearch:v1.x`), `MEILI_MASTER_KEY` env, `7700:7700`, named volume `meili_data`, healthcheck (`GET /health`), on `store_network` |
| `.env.example` (store-api)     | `MEILI_HOST` (e.g. `http://localhost:7700`), `MEILI_MASTER_KEY`, optional `MEILI_SEARCH_KEY`                                                                             |
| `src/config/env.validation.ts` | all Meili vars **optional** (feature is inert/falls back when unset)                                                                                                     |

## Architecture (Clean Architecture / bottom-up)

```
src/search/
  meili.client.ts            — thin @injectable wrapper over the `meilisearch` SDK
  meili.client.spec.ts
  search.service.ts          — index settings, upsert/delete docs, query + suggest, reindex
  search.service.spec.ts
  product-indexer.ts         — narrow interface ProductService depends on (index/remove one product)
  search.controller.ts       — GET /api/search, GET /api/search/suggest
  admin-search.controller.ts — POST /api/admin/search/reindex (AdminGuard)
  dto/ entities/ index.ts search.module.ts
```

- **`MeiliClient`** wraps the official `meilisearch` npm SDK (added to `apps/store-api/package.json`).
  `isConfigured()` returns false when `MEILI_HOST`/key absent → callers fall back. Base URL/key
  injectable so specs point at a mock. All network failures are caught and surfaced as "not
  available" so a down engine never 500s the storefront.
- **`SearchService`**: `ensureIndex()` (searchable = name, description, categoryName; filterable =
  isActive, categoryId; sortable = price, createdAt; ranking rules + typo tolerance defaults);
  `indexProduct(p)` / `removeProduct(id)`; `search(q, page)` → product summaries; `suggest(q)` →
  top-N lightweight hits (name, slug, price, primary image); `reindexAll()` pulls active products
  from `ProductRepository` in batches and replaces the index.
- **Index sync seam:** `ProductModule` imports `SearchModule`; `ProductService` calls the injected
  `ProductIndexer` from its existing mutation methods — mirror the `evictProductDetail` call sites
  (`create`, `update`, `activate` → upsert; `deactivate`, `delete` → remove). **Best-effort**:
  wrap in try/catch + log (never block or fail the product write). Only `isActive && !deletedAt`
  products are indexed.
- **What a document holds:** `id, name, description, slug, price, compareAtPrice, categoryId,
categoryName, primaryImageUrl, blurDataUrl, inStock` — enough to render a result card without a
  second DB hit. (Public, so no raw `stock`.)

## Query path & fallback

- `SearchController.search`/`suggest`: if `meiliClient.isConfigured()` and healthy → Meili; else →
  `ProductService`/`ProductRepository` Postgres `contains` (the current behaviour). Same response
  shape either way, so the frontend is engine-agnostic.
- Public endpoints are throttled (reuse the global ThrottlerGuard; suggest is hit per keystroke so
  the frontend debounces — see below).

## Sub-tasks (bottom-up; TDD for the service logic)

- **TASK-075-A** — Infra: `docker-compose` Meilisearch service + `.env.example` + optional env
  validation. Bring the container up for local dev.
- **TASK-075-B** — `MeiliClient` wrapper + `meilisearch` dep. **Red→Green** unit spec (mock SDK):
  `isConfigured()`, index ensure, add/delete/search delegate correctly; network error → "not
  available" (no throw to caller).
- **TASK-075-C** — `SearchService` (TDD): index settings, `indexProduct`/`removeProduct`,
  `search`/`suggest` mapping to product-summary entities, `reindexAll` batching. Mock `MeiliClient`
  - `ProductRepository`.
- **TASK-075-D** — `ProductIndexer` seam + wire into `ProductService` mutations (best-effort,
  try/catch, only active products). Update `product.service.spec` to assert index/remove is called
  on the right transitions and that a failing indexer does NOT fail the mutation.
- **TASK-075-E** — Controllers + DTOs + entities: `GET /api/search`, `GET /api/search/suggest`
  (public, `@ApiQuery q`, pagination), `POST /api/admin/search/reindex` (AdminGuard). Postgres
  fallback when Meili unconfigured. Add `Search` tag to `export-swagger.ts` + `main.ts`.
- **TASK-075-F** — Bootstrap reindex: run `ensureIndex()` + a best-effort `reindexAll()` on module
  init (or a lightweight scheduled reconcile) so a freshly-started engine self-populates; guarded
  so a down engine doesn't crash boot.
- **TASK-075-G** — `search.e2e-spec` (mocked `MeiliClient`, like `delivery.e2e`): controller +
  validation + fallback path + admin-guard on reindex. No container needed for CI.
- **TASK-075-H** — Orval regen (`swagger:export` → `generate:api`), `entities/search` hooks.
- **TASK-075-I** — Frontend `features/search`: `SearchAutocomplete` (reuse the `Combobox` primitive
  from TASK-080-C; debounce via direct `useDebouncedCallback` per forms.md Rule 3; WAI-ARIA
  listbox, keyboard up/down/enter/esc; Enter → `/search?q=`, pick → PDP). Dictionary keys.
- **TASK-075-J** — `widgets/header`: mount the search box (desktop center slot + inside the mobile
  Sheet). Keep the existing nav/badges/auth layout.
- **TASK-075-K** — `app/search/page.tsx`: `/search?q=` results grid (reuse `ProductCard`), loading
  - empty states, wired to the search hook.
- **TASK-075-L** — Frontend tests (RTL + MSW): autocomplete debounce/keyboard/select + results page
  render/empty. Full gate.

## Acceptance criteria

- With the engine up: `GET /api/search?q=айфон` and a typo `афйон` both return the iPhone products,
  ranked; header autocomplete shows live suggestions and navigates correctly; admin reindex
  repopulates; product create/activate makes an item searchable within a moment, deactivate/delete
  removes it.
- With the engine **down/unconfigured**: `/search` returns Postgres-`contains` results (no 500);
  the header box still works; the API boots normally.
- `store-api` unit + `search.e2e` (mocked client) green; `store-client` RTL green; Orval clean;
  `build`/`lint`/`typecheck` green in all workspaces.

## Verification

- `npm run test -w apps/store-api` (MeiliClient + SearchService + product-indexer specs) +
  `search.e2e`.
- `npm run test -w apps/store-client` (autocomplete + results page).
- Clean `swagger:export` + `generate:api`.
- **Pending manual QA (needs the Meilisearch container):** typo tolerance ("афйон"→"айфон"),
  ranking sanity, live index sync on CRUD, and the admin reindex — verified on a running stack
  (mirrors the Nova Poshta live-key deferral; automated coverage uses a mocked client).

## Session notes (not a parallel wave)

- **Single feature, sequential build** (A→L). No migration → no schema mutex. The only shared-file
  touches are additive: `product.service`/`product.module` (indexer seam), `app.module`
  (SearchModule import), `export-swagger`/`main.ts` (`Search` tag), `docker-compose`,
  `env.validation`, header widget, dictionary. All owned by this one session — no cross-stream
  coordination needed.
- Best executed as one focused agent session (build, or tdd-agent for the service core) or driven
  directly. Bring the Meilisearch container up first if live verification is wanted this session;
  otherwise build against the mocked client and defer the live check to _Pending manual QA_.
