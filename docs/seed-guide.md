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
- **Brands, discounts, pages** upsert on their unique key (`slug` / `code` / `slug`);
  **contact messages** on a deterministic id; **newsletter subscribers** on the normalized email.
- **Attribute definitions** upsert on the `(categoryId, key)` unique, **attribute values** on
  `(productId, definitionId)`, and **device-compat links** on the `(productId, deviceModelId)`
  composite key — all safe to re-run.
- **Orders** upsert on a deterministic id; each order's **items** and **status-history** trail are
  deleted + recreated wholesale per run, and the **discount redemption** upserts on its unique
  `orderId`. `Discount.redeemedCount` is recomputed from the seeded redemptions on every run.

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

By default the seed creates the primary admin as `admin@store.com` / `Admin123!`. To use
different credentials for **that account**, set these env vars in `apps/store-api/.env`
**before seeding**:

```env
ADMIN_SEED_EMAIL=you@example.com
ADMIN_SEED_PASSWORD=YourStrongPassword123!
```

The admin upsert is idempotent and re-asserts the `ADMIN` role on every run. To promote an
already-registered account instead of seeding a new admin, run SQL directly:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = '<email>';
```

### Seeded login credentials

| Role     | Email                  | Password       | Notes                                 |
| -------- | ---------------------- | -------------- | ------------------------------------- |
| Admin 1  | `admin@store.com`      | `Admin123!`    | Олександр Коваленко (env-overridable) |
| Admin 2  | `manager@store.com`    | `Manager123!`  | Ірина Мельник (fixed)                 |
| Customer | `customer@store.com`   | `Customer123!` | Demo account (John Doe)               |
| Customer | `oksana@example.com`   | `Customer123!` | Оксана Шевченко                       |
| Customer | `taras@example.com`    | `Customer123!` | Тарас Бондаренко                      |
| Customer | `mariia@example.com`   | `Customer123!` | Марія Коваль                          |
| Customer | `dmytro@example.com`   | `Customer123!` | Дмитро Ткаченко                       |
| Customer | `nataliia@example.com` | `Customer123!` | Наталія Кравченко                     |

Only Admin 1's email/password are configurable (via the env vars above). Everything else is
fixed. The 20 approved-review accounts (`reviewer1@store.com` … `reviewer20@store.com`) and 3
pending-review accounts (`pending-reviewer1@store.com` … `pending-reviewer3@store.com`) all use
password `Reviewer123!` and are not configurable.

---

## 7. What gets seeded

A clean seed produces (counts as of the seed-enrichment pass — Users/Brands/Смартфони/Orders):

| Entity                 | Count        | Notes                                                                                                      |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| Users                  | 31           | 2 admins + 6 customers + 20 reviewers + 3 pending-review accounts                                          |
| Brands                 | 6            | Apple, Samsung, Xiaomi, Baseus, Anker, Spigen (product manufacturers, TASK-189)                            |
| Categories             | 15           | 5 root (Cases, Chargers, Cables, Screen Protectors, **Смартфони**) + 10 subcategories (incl. **iPhone**)   |
| Product groups         | 14           | Multi-variant entries become groups (variant-as-position, TASK-142); incl. iPhone 15 Pro (storage × color) |
| Product positions      | 40           | Group members + standalone; incl. 6 iPhone 15 Pro positions + iPhone 14 / iPhone 13 standalone             |
| Product images         | 69           | Deterministic `picsum.photos` URLs per position                                                            |
| Attribute definitions  | 4            | Екран / Пам'ять / Камера / Акумулятор on **Смартфони** (inherited by iPhone), TASK-191                     |
| Attribute values       | 32           | 4 structured specs filled on each of the 8 iPhone positions                                                |
| Device compat links    | 30           | Accessories ↔ Apple device models (`ProductDeviceCompat`, TASK-190)                                        |
| Reviews (approved)     | 5–20/product | Pre-approved (`isActive = true`), deterministic, ratings skewed positive                                   |
| Reviews (pending)      | 6            | `isActive = false` with UA comments — populate the admin moderation queue                                  |
| Discounts              | 5            | WELCOME10, SUMMER500 (minSpend), VIP20, EXPIRED15 (past), OLDPROMO (inactive)                              |
| Orders                 | 12           | Cover **every** OrderStatus + PaymentStatus; deterministic ids                                             |
| Order items            | 17           | Price captured at purchase                                                                                 |
| Discount redemptions   | 2            | WELCOME10 + SUMMER500 (unique per order)                                                                   |
| Order status history   | 53           | Append-only STATUS + PAYMENT_STATUS trails (admin/system `changedBy`)                                      |
| Contact messages       | 5            | NEW / READ / ARCHIVED (TASK-177)                                                                           |
| Newsletter subscribers | 6            | Mix of SUBSCRIBED / UNSUBSCRIBED (TASK-188)                                                                |
| Pages                  | 6            | UA PUBLISHED info pages (about, delivery, returns, warranty, privacy-policy, terms), TASK-187              |
| Blog posts             | 12           | UA, PUBLISHED; ≥2 featured                                                                                 |
| Addresses              | 8            | `seed-address-1` (John) + 1–2 UA addresses per new customer (deterministic ids)                            |

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
