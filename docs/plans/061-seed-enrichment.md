# Plan: Seed Enrichment (TASK-128 Residual)

> **Status:** Done ✅ (all sub-tasks A/B/C complete)
> **Phase:** Phase B — Reliability & Observability (QA pass triage — UX, data & admin polish)
> **Created:** 2026-06-26
> **Last Updated:** 2026-06-26
> **TASK:** TASK-128 (residual after TASK-142-G absorbed the core seed overhaul)

> **Outcome:** TASK-128-A found `npm run db:studio` was **actually broken** (Prisma 7 `studio`
> rejects the `--schema` flag the other commands use) — fixed by dropping the flag from the
> `prisma:studio` script; Studio now opens on an auto-selected port. TASK-128-B added multi-image
> entries to 8 of 15 product entries → 17 positions now render the gallery strip; reseed produced
> 32 positions / 53 images with 0 duplicate primaries. TASK-128-C shipped `docs/seed-guide.md`.

---

## Overview

TASK-142-G rewrote `prisma/seed.ts` to produce 32 positions across 13 groups under the
new variant-as-position model (out-of-stock position, sale items, real descriptions,
group axes, deterministic picsum images). That absorbed the bulk of TASK-128.

Three items from the original TASK-128 scope were **not** absorbed:

1. **Multi-image seed enrichment** — only 1 of 15 product entries in `productsData` has more
   than one image (`Silicone Case for iPhone 15` has 2). Every other position gets a single
   image, so the `ProductImageGallery` thumbnail strip (gated on `images.length > 1`) cannot
   be exercised during manual QA. This is explicitly called out in the TASK-126 pending manual
   QA row: _"Thumbnail strip needs TASK-128 multi-image seed to exercise"_.
2. **Developer re-seed guide** — no `docs/seed-guide.md` exists. Developers have no documented
   procedure for re-seeding after migrations, resetting a dev DB, or overriding admin credentials.
3. **`db:studio` script verification** — the root `npm run db:studio` and its workspace delegate
   `prisma:studio` now look correct in both `package.json` files. The original bug report needs
   explicit confirmation on a running DB.

No Prisma migration, no backend module code, no Orval regen, and no frontend code changes are
needed. All work is in `apps/store-api/prisma/seed.ts` and documentation files.

---

## Scope

### In Scope

- Add 2-3 image entries to at least 6 of the 15 product entries in `seedProducts` so those
  positions have a thumbnail strip when the seed is applied.
- Confirm `npm run db:studio -w apps/store-api` launches Prisma Studio without error; fix if
  needed.
- Create `docs/seed-guide.md` — developer reference covering re-seed prerequisites, commands,
  idempotency guarantees, credential overrides, and DB-reset procedures.

### Out of Scope

- Adding new products, categories, or groups — TASK-142-G already provides adequate pagination
  data (32 positions).
- Real product photographs or CDN URLs — picsum.photos placeholder URLs remain the seed strategy
  until an image CDN is configured.
- Playwright / automated E2E tests for the gallery strip — that belongs to TASK-105-D.
- Any Prisma schema change.
- Any backend service, repository, or controller change.
- Any storefront or admin frontend change.

---

## User Stories

1. As a developer running manual QA, I want the product image gallery thumbnail strip to be
   visible on multiple PDPs so I can verify TASK-126-D gallery tests match real UI behavior.
2. As a developer onboarding to the project, I want a clear re-seed guide so I know what command
   to run after applying a migration without asking teammates.
3. As a developer, I want `npm run db:studio` to open Prisma Studio without errors so I can
   inspect seed data visually.

---

## Technical Design

### Data Model

No Prisma schema changes. `Product`, `ProductGroup`, `ProductGroupAxis`, and `ProductImage` are
already in place from TASK-142-A.

### Seed Architecture (existing patterns)

The current `seed.ts` uses a `productsData` array where each entry carries an `images` array.
The seeding loop clones those image entries onto every position in the group, generating
deterministic picsum URLs:

```
https://picsum.photos/seed/{positionSlug}-{img.sortOrder}/800/800
```

Adding a second or third image entry (`sortOrder: 1`, `sortOrder: 2`) to a product entry
automatically produces 2-3 distinct, stable URLs per position because `positionSlug` already
encodes the variant name. No other change to the seeding loop is needed.

### Target products for multi-image enrichment

| Entry in `productsData`                               | Current images | Target   |
| ----------------------------------------------------- | -------------- | -------- |
| Silicone Case for iPhone 15 (already has 2)           | 2              | 2 (keep) |
| Clear MagSafe Case for iPhone 15 Pro                  | 1              | 3        |
| Armor Case for Samsung Galaxy S24                     | 1              | 2        |
| 20W USB-C Wall Charger                                | 1              | 2        |
| 15W Qi Wireless Charging Pad                          | 1              | 3        |
| Tempered Glass Screen Protector for iPhone 15         | 1              | 2        |
| PET Film Screen Protector for Samsung Galaxy S24      | 1              | 2        |
| Universal Phone Holder for Car Dashboard (standalone) | 1              | 2        |

This gives 8 of 15 entries with 2+ images, resulting in gallery strips on at least 20+ positions
across all major categories — enough for a thorough QA sweep.

### Backend

No module changes. `seed.ts` is run via `tsx prisma/seed.ts` (configured in `package.json`
under `"prisma": { "seed": "tsx prisma/seed.ts" }`). The seeding loop already handles the
`images` array correctly.

### `db:studio` script chain

```
Root package.json:
  "db:studio": "npm run prisma:studio -w apps/store-api"

apps/store-api/package.json:
  "prisma:studio": "prisma studio --schema=prisma/schema.prisma"
```

Both scripts exist and look correct. TASK-128-A is a verification task: run the script on a
live DB and confirm it opens without error. If it fails (e.g., schema path resolution issue),
fix the failing `package.json` entry.

### Re-seed Guide (`docs/seed-guide.md`)

Sections to cover:

1. **Prerequisites** — Docker PostgreSQL container running; `DATABASE_URL` set in `.env`.
2. **Commands quick reference** — `npm run db:seed` (re-seed only), `npm run db:migrate` (migrate
   then seed automatically via `prisma migrate dev` seed hook), `npm run db:studio` (inspect).
3. **Idempotency** — All `upsert` calls use stable natural keys (`slug`, `email`, `userId_productId`
   composite). Re-running the seed on a populated DB is safe; no duplicates will be created.
   Exception: `ProductGroupAxis` rows are deleted and recreated wholesale on each run (by design,
   to stay in sync with seed data).
4. **After a Prisma migration** — Run `npm run db:migrate` (which triggers the seed hook via
   `prisma migrate dev`). If only the seed data needs refreshing without a schema change, run
   `npm run db:seed` directly.
5. **Resetting a dev DB** — Run `npx prisma migrate reset --schema=apps/store-api/prisma/schema.prisma`
   from the repo root (this drops, recreates, migrates, and seeds in one step). **Never run
   against production.**
6. **Admin credential override** — Set `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` in `.env`
   before seeding to use custom admin credentials instead of the defaults (`admin@store.com` /
   `Admin123!`).
7. **What gets seeded** — Users (1 admin + 1 customer + 20 reviewers), categories (4 root + 9
   subcategories), products (32 positions across 13 groups + 2 standalone; 1 out-of-stock),
   product images (2-3 per position after TASK-128-B), reviews (5-16 per product, pre-approved),
   addresses (1 default shipping address for the seed customer).
8. **Known constraints** — `seed-address-1` is hard-coded as the address ID for idempotency; do
   not use that ID for test data outside the seed.

---

## Tasks

### TASK-128-A: Verify `npm run db:studio`

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none (TASK-142-A already merged)

**Acceptance Criteria:**

- [ ] `npm run db:studio` runs from the repo root without error on a live PostgreSQL DB with
      the TASK-142 migration applied.
- [ ] If the script fails, the root cause is identified and the fix is applied to the relevant
      `package.json` (root or workspace).
- [ ] Running `npm run db:studio -w apps/store-api` also works (direct workspace invocation).
- [ ] Outcome (working / needed fix) is noted in `docs/seed-guide.md` under the commands section
      (covered by TASK-128-C).

**Files to create/modify:**

- `package.json` — fix `db:studio` script if verification finds a bug
- `apps/store-api/package.json` — fix `prisma:studio` script if verification finds a bug

---

### TASK-128-B: Expand seed images to 2-3 per product entry

**Type:** chore
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-142-G (✅ merged to develop)

**Acceptance Criteria:**

- [ ] At least 6 product entries in `productsData` (not counting the Silicone Case that already
      has 2) have 2 or more image entries in their `images` array.
- [ ] All added image entries follow the existing convention: `url` is a `/images/products/…`
      placeholder path, `alt` is a descriptive string, `sortOrder` is sequential (0, 1, 2…).
- [ ] After running `npm run db:seed` on a clean DB, every position seeded from a multi-image
      entry has 2+ rows in `product_images`.
- [ ] No duplicate `isPrimary` = true rows per product (only `sortOrder === 0` is primary).
- [ ] `npm run db:seed` completes without error; seed log shows updated image count.
- [ ] On a running storefront, navigating to a PDP for a multi-image position renders the
      thumbnail strip (visible strip = `images.length > 1` gate passes).
- [ ] Seed remains idempotent: running `npm run db:seed` twice produces the same DB state
      (the `deleteMany` + `createMany` pattern in the loop already ensures this).

**Files to create/modify:**

- `apps/store-api/prisma/seed.ts` — add `sortOrder: 1` (and `sortOrder: 2` where applicable)
  image entries to the target product entries listed in the Technical Design table above

---

### TASK-128-C: Write developer re-seed guide

**Type:** docs
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-128-A (verification outcome feeds the commands section), TASK-128-B
(final image counts feed the "What gets seeded" section)

**Acceptance Criteria:**

- [ ] `docs/seed-guide.md` exists and covers all 8 sections defined in the Technical Design
      (Prerequisites, Commands, Idempotency, After migration, DB reset, Credential override, What
      gets seeded, Known constraints).
- [ ] All commands in the guide are copy-pasteable and accurate for the current monorepo structure
      (npm workspace flags, schema path flags).
- [ ] The guide documents the `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` env var override.
- [ ] The guide warns against running `migrate reset` on production.
- [ ] The guide reflects the outcome of TASK-128-A (confirms `db:studio` command works or
      documents any fix applied).
- [ ] The guide reflects the final image counts from TASK-128-B.

**Files to create/modify:**

- `docs/seed-guide.md` — new developer reference document

---

## Migration Steps

No Prisma migration is needed. Execution order:

1. **TASK-128-A** — Verify `db:studio` on a live DB (needs Docker up). Fix any script issue.
2. **TASK-128-B** — Edit `seed.ts` to add multi-image entries; run `npm run db:seed` to verify;
   spot-check gallery strip on a running storefront.
3. **TASK-128-C** — Write `docs/seed-guide.md` incorporating outcomes from A and B.

TASK-128-A and TASK-128-B can be started in parallel if two environments are available (A needs
a running DB; B only needs the source file edit + a DB to test against). TASK-128-C depends on
both completing.

---

## Risks & Mitigations

| Risk                                                                                                                                                                   | Mitigation                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db:studio` has a deeper failure mode (missing binary, adapter incompatibility)                                                                                        | Check `npx prisma studio` directly to isolate script delegation from Prisma itself; log exact error                                                                                                                             |
| Adding images to standalone positions that share a single-position "group" makes the strip appear unexpectedly (design intent: strip only shows for grouped positions) | Gallery gate is `images.length > 1`, not `group != null`. Adding a second image to a standalone position (e.g., `Universal Phone Holder`) is valid; confirm with Oleksii if standalone positions should have multi-image or not |
| picsum.photos seed URLs become unavailable in CI/offline                                                                                                               | These are dev seed images only; production images go through the admin upload flow. No action needed for this plan                                                                                                              |
| `deleteMany + createMany` for images is not atomic — a crash mid-loop leaves a product with no images                                                                  | Acceptable for a dev seed; add a note to the guide about re-running the seed to recover                                                                                                                                         |

---

## Notes

- **`db:studio` was broken (corrected)** — the original assumption that it "likely already works"
  was wrong. Under Prisma 7 the `studio` subcommand rejects `--schema` (`unknown or unexpected
option: --schema`), unlike `generate`/`migrate`/`db seed` which still accept it. Fix: drop the
  flag from `prisma:studio` (`apps/store-api/package.json`) — the schema is resolved from
  `prisma.config.ts` automatically. Studio also now binds an auto-selected port (e.g. `:51212`),
  not `5555`; pass `--port 5555` to pin it.
- **Thumbnail strip gate** — `ProductImageGallery` hides the strip when `images.length <= 1`
  (confirmed correct by TASK-126-C). This design means every position must have its own image
  rows in `product_images`. The seed already creates per-position images (the loop clones `p.images`
  onto each position). Adding more entries to `p.images` will therefore give every sibling position
  in the group the same number of images — which is the correct behaviour (the gallery shows the
  same product from different angles, not variant-specific shots).
- **Relationship to TASK-126 manual QA** — after TASK-128-B is shipped and seeded, the TASK-126
  pending manual QA row ("Thumbnail strip needs TASK-128 multi-image seed to exercise") can be
  cleared during the next running-stack QA session.
- **No Orval regen** — `ProductImage` fields are already in the generated types. No API contract
  change occurs.
- **TASK-128 parent close-out** — once TASK-128-A, B, and C are all ✅, mark the parent
  `TASK-128` row in `BACKLOG.md` as ✅ and move the sub-task detail to `docs/backlog-archive.md`.
