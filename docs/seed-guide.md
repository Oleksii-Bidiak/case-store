# Database Seed Guide

> **Audience:** Developers running `store-api` locally. Covers re-seeding the dev database,
> resetting it, overriding admin credentials, and inspecting the result. See
> `docs/plans/061-seed-enrichment.md` (TASK-128) for the rationale behind the current seed shape.

The seed script lives at `apps/store-api/prisma/seed.ts` and is registered as the Prisma seed
hook in `apps/store-api/prisma.config.ts` (`migrations.seed: 'tsx prisma/seed.ts'`).

---

## 1. Prerequisites

- **Docker** running with the project's PostgreSQL container up:
  ```bash
  docker compose up -d postgres
  ```
  Confirm it is healthy: `docker ps` should list `store_postgres` as `Up … (healthy)`.
- **`DATABASE_URL`** set in `apps/store-api/.env` (copy from `.env.example` if missing). The seed,
  Prisma Studio, and migrations all read this connection string via `prisma.config.ts`.
- Dependencies installed at the repo root: `npm install`.

> The `.env` file is git-ignored and protected by a pre-commit hook — never print or commit it.

---

## 2. Commands quick reference

All commands run from the **repo root** unless noted. They delegate to the `store-api` workspace.

| Command               | What it does                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run db:seed`     | Run the seed script against the current DB (no schema change). Idempotent.      |
| `npm run db:migrate`  | Apply pending migrations via `prisma migrate dev`, then auto-run the seed hook. |
| `npm run db:push`     | Push the schema to the DB without creating a migration (rapid dev only).        |
| `npm run db:studio`   | Open Prisma Studio to browse/edit seeded data in the browser.                   |
| `npm run db:generate` | Regenerate the Prisma Client after a schema change.                             |

Workspace-direct equivalents (run from anywhere) use the `-w` flag, e.g.
`npm run db:seed -w apps/store-api`.

### Prisma Studio note (Prisma 7)

`npm run db:studio` works and opens Studio in your default browser. Two Prisma 7 behaviours to know:

- Studio **picks an available port automatically** (e.g. `http://localhost:51212`) rather than
  always using `5555`. The chosen URL is printed in the terminal. To pin a fixed port, run the
  binary directly: `npx prisma studio --port 5555 -w apps/store-api`.
- The `studio` subcommand **no longer accepts `--schema`** (unlike `generate`/`migrate`/`db seed`).
  The schema is resolved from `prisma.config.ts` automatically. The `prisma:studio` script was
  fixed in TASK-128-A to drop the obsolete `--schema` flag — if you ever see
  `unknown or unexpected option: --schema`, that flag has crept back in.

---

## 3. Idempotency

Re-running `npm run db:seed` on a populated DB is **safe** — it will not create duplicates:

- **Users, categories, products, reviews, addresses** are written with `upsert` keyed on a stable
  natural key (`email`, `slug`, the `userId_productId` composite for reviews, and the fixed
  `seed-address-1` id for the demo address).
- **Product groups** upsert on a deterministic UUID derived from the entry slug
  (`deterministicUuid(slug)`), so groups stay stable across runs.
- **Product group axes** and **product images** are deleted and recreated wholesale per entry on
  every run (`deleteMany` + `create`/`createMany`). This keeps them exactly in sync with the seed
  source even if you change axis names or image lists between runs.

Because images are `deleteMany`-then-recreate per position, a crash mid-loop could leave a position
with no images. Recovery is simply re-running `npm run db:seed`.

---

## 4. After a Prisma migration

When you change `prisma/schema.prisma`:

```bash
npm run db:migrate            # creates + applies the migration, then runs the seed hook
```

`prisma migrate dev` triggers the seed hook automatically, so the DB is migrated **and** reseeded
in one step. If you only changed seed data (no schema change), skip the migration and run the seed
directly:

```bash
npm run db:seed
```

After any schema change, regenerate the client so TypeScript stays in sync:

```bash
npm run db:generate
```

---

## 5. Resetting a dev database

To drop, recreate, migrate, and reseed in one step (from the repo root):

```bash
npx prisma migrate reset --schema=apps/store-api/prisma/schema.prisma
```

This wipes **all** data in the target database. **Never run `migrate reset` against a production
or shared database** — it is destructive and irreversible.

---

## 6. Admin credential override

By default the seed creates an admin as `admin@store.com` / `Admin123!`. To use different
credentials, set these env vars in `apps/store-api/.env` **before seeding**:

```env
ADMIN_SEED_EMAIL=you@example.com
ADMIN_SEED_PASSWORD=YourStrongPassword123!
```

The admin upsert is idempotent and re-asserts the `ADMIN` role on every run. To promote an
already-registered account instead of seeding a new admin, run SQL directly:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = '<email>';
```

The seed customer (`customer@store.com` / `Customer123!`) and the 20 reviewer accounts
(`reviewer1@store.com` … `reviewer20@store.com`, password `Reviewer123!`) are not configurable.

---

## 7. What gets seeded

A clean seed produces (counts as of TASK-128-B):

| Entity            | Count | Notes                                                                                             |
| ----------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Users             | 22    | 1 admin + 1 customer + 20 reviewers                                                               |
| Categories        | 13    | 4 root (Cases, Chargers, Cables, Screen Protectors) + 9 subcategories                             |
| Product groups    | 13    | Multi-variant entries become groups (variant-as-position model, TASK-142)                         |
| Product positions | 32    | Group members + 2 standalone; one standalone (`Braided USB-C … 2m`) is out of stock (`stock = 0`) |
| Product images    | 53    | Deterministic `picsum.photos` URLs per position; 17 positions have a 2–3 image gallery            |
| Reviews           | 342   | Pre-approved (`isActive = true`), 5–16 per product, ratings skewed positive                       |
| Addresses         | 1     | Default shipping address for the seed customer                                                    |

Images use deterministic `https://picsum.photos/seed/{positionSlug}-{sortOrder}/800/800` URLs so the
storefront looks populated without real uploads. The first image (`sortOrder === 0`) of each
position is the primary/cover. Positions seeded from a multi-image entry render the
`ProductImageGallery` thumbnail strip (gated on `images.length > 1`), which is what TASK-128-B
enabled for QA.

---

## 8. Known constraints

- **`seed-address-1`** is a hard-coded address id used for idempotency. Do not reuse that id for
  test data outside the seed, or the upsert will overwrite your row.
- **picsum.photos** placeholder URLs require network access; in a fully offline environment the
  storefront images will not load, but the seed itself still succeeds (no images are fetched at
  seed time). Real product images go through the admin upload flow, not the seed.
- The seed assumes an empty or already-seeded DB. It does **not** delete unrelated rows you may
  have created manually — only seed-owned axes and images are replaced wholesale.
