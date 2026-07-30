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
- **Banners, carousels, FAQ items** upsert on a deterministic/fixed id; **blog categories/posts**
  and **device brands/models** on their unique `slug`. A carousel's MANUAL **items** are deleted and
  recreated wholesale per run (like images). **Addon services** have no unique key in the schema, so
  the seed looks them up by `name` and updates in place instead of upserting.
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

### If `migrate status` says none of the migrations are applied (TASK-347)

A database created in the `db push` era has no `_prisma_migrations` table at all, so Prisma
considers every committed migration pending and `migrate dev` is unusable — it wants to apply
migrations that would collide with tables already there. The fix is to **baseline**: prove the
live schema already matches the history, then record the history as applied without running it.

Never skip straight to `migrate resolve`. If the database is even one index behind, marking
everything applied freezes that gap in permanently — no future migration will ever add it.

```bash
# from apps/store-api
npx prisma migrate status                                    # confirm: "have not yet been applied"

# 1. Is the live database already what the history produces? Needs a shadow DB, which
#    `migrate diff --from-migrations` requires you to declare via datasource.shadowDatabaseUrl
#    in a Prisma config. Copy prisma.config.ts, add that field, pass it with --config.
npx prisma migrate diff --config <tmp-config>.ts \
  --from-migrations ./prisma/migrations --to-config-datasource --script --exit-code

# 2. And does it match schema.prisma? (no shadow DB needed)
npx prisma migrate diff --from-schema ./prisma/schema.prisma \
  --to-config-datasource --script --exit-code
```

Exit `0` means identical, `2` means there is a difference, `1` means the command itself failed —
do not read a failed invocation as "different". If either diff is non-empty, apply the missing
DDL first (`npx prisma db execute --file <the migration.sql that introduced it>` keeps the result
byte-identical to what the migration would have produced), then re-run both diffs until both
report `0`.

Only then record the history:

```bash
for m in $(ls -d prisma/migrations/*/ | xargs -n1 basename | sort); do
  npx prisma migrate resolve --applied "$m"
done
npx prisma migrate status    # "Database schema is up to date!"
```

`migrate dev` also provisions its own shadow database on every run, so the role in `DATABASE_URL`
needs `CREATEDB`. Check with `SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user`.

---

## 5. Resetting a dev database

To drop, recreate, migrate, and reseed in one step (from the repo root):

```bash
npx prisma migrate reset --schema=apps/store-api/prisma/schema.prisma
```

This wipes **all** data in the target database. **Never run `migrate reset` against a production
or shared database** — it is destructive and irreversible.

---

## 6. Production guard (`ALLOW_PROD_SEED`)

The seed is **dev/demo fixture data**: it creates accounts whose passwords are published in this
very file. Running it against production would hand anyone a working login. Therefore
`assertSeedAllowed()` (in `prisma/seed.ts`, called first thing in `main()`, **before** the
connection pool is opened) enforces:

| `NODE_ENV`       | `ALLOW_PROD_SEED`     | Result                                                                                    |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| not `production` | (ignored)             | Seeds normally — dev fallback credentials allowed.                                        |
| `production`     | unset / anything else | **Throws, exits 1, writes nothing.**                                                      |
| `production`     | `true`                | Runs — **but** `ADMIN_SEED_EMAIL` + `ADMIN_SEED_PASSWORD` must both be set, or it throws. |

The escape hatch exists for one legitimate case: bootstrapping a **fresh** staging/demo instance
that must come up with content (categories, products, banners, carousels, pages). Be aware it also
creates the demo customers and the 23 reviewer accounts with the fixed passwords listed below —
never point it at a database holding real customers.

```bash
# Staging bootstrap (deliberate):
NODE_ENV=production ALLOW_PROD_SEED=true ADMIN_SEED_EMAIL=you@example.com \
  ADMIN_SEED_PASSWORD='<strong-unique-password>' npm run db:seed
```

### Seeding a REMOTE environment (staging, demo, any server)

The command above needs a machine that can actually run it — and **that is never the server**.

- **The image cannot seed itself.** `package.json` declares `"seed": "tsx prisma/seed.ts"`, and
  `tsx` is a devDependency stripped by `npm prune --omit=dev` (`apps/store-api/Dockerfile:63`).
  The `prisma/` directory _is_ copied into the runner, so `seed.ts` sits there — with nothing
  able to execute it. That is deliberate: a production image has no business creating accounts
  whose passwords are published in this file.
- **The compose file makes no difference.** `docker-compose.staging.yml` only swaps the image
  source to GHCR (`ghcr.io/<owner>/store-api:staging-latest`) — the same images, from the same
  Dockerfile. Staging and production are identical in this respect.
- **CI does not seed.** Neither `deploy-staging` nor `deploy-production` in `ci.yml` has a seed
  step. Nothing will do this for you.

So there is exactly one procedure, and it is the same for every remote environment: temporarily
publish Postgres on the **server's** `127.0.0.1`, open an SSH tunnel from a machine with the full
toolchain, and run the command above against `localhost`. Step-by-step commands live in
[`deploy/03b-test-deploy-no-domain.md`](deploy/03b-test-deploy-no-domain.md) §7 — written for the
demo, but only the address and credentials change for staging.

Two things that procedure will not do for you:

- **The tunnel carries database rows only.** Seed imagery (§8) is written as files on the machine
  running the seed, so those files stay on your laptop while the rows point at the server. Ship
  them separately — `tar` + `scp` + `docker compose cp` into the `uploads_data` volume, then
  `chown` them to the container's `nestjs` user. Commands: `03b` §7.5.
- **`PUBLIC_BASE_URL` must be exported alongside the seed command**, set to the target's public
  API origin. Under `NODE_ENV=production` the seed refuses to run without it (§8) rather than
  bake `localhost` URLs into a remote database.

> Port clash to expect: your own dev Postgres already holds `5432`. Either stop it, or forward to
> a different local port — `ssh -N -L 55432:localhost:5432 …` with `…@localhost:55432/…` in
> `DATABASE_URL`.

---

## 7. Admin credential override

The seed creates exactly **one** admin: `admin@store.com` / `Admin123!` by default. To use
different credentials for that account, set these env vars in `apps/store-api/.env`
**before seeding** (in production they are mandatory — see §6):

```env
ADMIN_SEED_EMAIL=you@example.com
ADMIN_SEED_PASSWORD=YourStrongPassword123!
```

The admin upsert is idempotent and re-asserts the `ADMIN` role on every run.

### Adding a second admin (the seed no longer does)

The seed used to create a hardcoded second admin (`manager@store.com` / `Manager123!`). It was
removed — a fixed, non-overridable credential pair in a script that anyone can run is exactly the
hazard §6 guards against. To get a second admin, register the account through the storefront/admin
sign-up and then promote it:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = '<email>';
```

> If your dev database was seeded **before** this change it still contains the old
> `manager@store.com` ADMIN row — the seed only stops maintaining it, it never deletes rows.
> Remove it with `DELETE FROM users WHERE email = 'manager@store.com';` (or reset the DB, §5).

### Seeded login credentials

| Role     | Email                  | Password       | Notes                                 |
| -------- | ---------------------- | -------------- | ------------------------------------- |
| Admin    | `admin@store.com`      | `Admin123!`    | Олександр Коваленко (env-overridable) |
| Customer | `customer@store.com`   | `Customer123!` | Demo account (John Doe)               |
| Customer | `oksana@example.com`   | `Customer123!` | Оксана Шевченко                       |
| Customer | `taras@example.com`    | `Customer123!` | Тарас Бондаренко                      |
| Customer | `mariia@example.com`   | `Customer123!` | Марія Коваль                          |
| Customer | `dmytro@example.com`   | `Customer123!` | Дмитро Ткаченко                       |
| Customer | `nataliia@example.com` | `Customer123!` | Наталія Кравченко                     |

Only the admin's email/password are configurable (via the env vars above). Everything else is
fixed. The 20 approved-review accounts (`reviewer1@store.com` … `reviewer20@store.com`) and 3
pending-review accounts (`pending-reviewer1@store.com` … `pending-reviewer3@store.com`) all use
password `Reviewer123!` and are not configurable.

---

## 8. What gets seeded

A clean seed produces:

| Entity                 | Count | Notes                                                                                                                                        |
| ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Users                  | 30    | 1 admin + 6 customers + 20 reviewers + 3 pending-review accounts                                                                             |
| Brands                 | 16    | Apple, Samsung, Xiaomi, Huawei, Sony, JBL, Anker, Baseus, Belkin, Spigen, Nillkin, Hoco, Borofone, UGREEN, SanDisk, Remax (TASK-189/366)     |
| Categories             | 43    | 11 Ukrainian roots + 32 subcategories (TASK-366). Only `iPhone` and `Samsung Galaxy` are Latin — proper nouns                                |
| Product groups         | 58    | Multi-variant entries become groups (variant-as-position, TASK-142); axes are Ukrainian — «Колір», «Пам'ять», «Довжина», «Комплект», «Об'єм» |
| Product positions      | 178   | Group members + standalone. 14 with `stock = 0` (sold-out UI), 23 with 1–4 (low-stock widget), 79 with a `compareAtPrice`                    |
| Product images         | 381   | Generated locally into `UPLOAD_DEST/products/` as WebP + LQIP (TASK-365) — see §8                                                            |
| Attribute definitions  | 46    | Declared on all 11 ROOT categories, inherited down each subtree; the first two per root are filterable (TASK-191/366)                        |
| Attribute values       | 728   | Every one of the 178 positions carries at least 3 filled specs — fewer and the facets read empty                                             |
| Addon services         | 4     | + 3 category templates on «Смартфони» and 3 product deltas on **named** iPhone positions (ADD / REMOVE / OVERRIDE)                           |
| Device brands          | 3     | Compatible-device taxonomy (Apple / Samsung / Xiaomi) — distinct from product Brands, TASK-190                                               |
| Device models          | 40    | Grouped by `series` for the storefront ModelPicker cascade                                                                                   |
| Device compat links    | 143   | Accessories ↔ Apple / Samsung / Xiaomi models across 30 catalogue entries (`ProductDeviceCompat`, TASK-190)                                  |
| Banners                | 6     | PUBLISHED, across the homepage placements (HERO_SLIDE / PROMO_TILE / …), TASK-186                                                            |
| **Carousels**          | **5** | **3 `HOME_TABS` + 2 `HOME_RAILS`, all PUBLISHED — see below (TASK-139, TASK-288)**                                                           |
| Carousel items         | 4     | Hand-picked products on the MANUAL rail; replaced wholesale on re-run                                                                        |
| Reviews (approved)     | 2 203 | 5–20 per position, pre-approved (`isActive = true`), deterministic, ratings skewed positive                                                  |
| Reviews (pending)      | 6     | `isActive = false` with UA comments, on six **named** positions — the admin moderation queue is always exactly these six                     |
| Discounts              | 5     | WELCOME10, SUMMER500 (minSpend), VIP20, EXPIRED15 (past), OLDPROMO (inactive)                                                                |
| Orders                 | 12    | Cover **every** OrderStatus + PaymentStatus; deterministic ids                                                                               |
| Order items            | 17    | Price captured at purchase                                                                                                                   |
| Discount redemptions   | 2     | WELCOME10 + SUMMER500 (unique per order)                                                                                                     |
| Order status history   | 53    | Append-only STATUS + PAYMENT_STATUS trails (admin/system `changedBy`)                                                                        |
| Contact messages       | 5     | NEW / READ / ARCHIVED (TASK-177)                                                                                                             |
| Newsletter subscribers | 6     | Mix of SUBSCRIBED / UNSUBSCRIBED (TASK-188)                                                                                                  |
| Pages                  | 7     | UA PUBLISHED info pages (about, delivery, returns, warranty, privacy-policy, terms, offer), TASK-187                                         |
| Blog categories        | 5     | UA; upsert on `slug`                                                                                                                         |
| Blog posts             | 12    | UA, PUBLISHED; ≥2 featured                                                                                                                   |
| FAQ items              | 6     | UA Q&A migrated from the storefront's former static list (TASK-242)                                                                          |
| Site contact settings  | 1     | Singleton row (fixed id `…0001`), TASK-154                                                                                                   |
| SEO settings           | 1     | Singleton row (fixed id `…0002`) with zero-config defaults, TASK-239                                                                         |
| Addresses              | 8     | `seed-address-1` (John) + 1–2 UA addresses per new customer (deterministic ids)                                                              |

### Homepage carousels (TASK-288)

`Carousel.placement` decides where a carousel surfaces; `sortOrder` is scoped **within** a
placement (so both buckets start at 0):

| Placement    | Title                | Source        | sortOrder | itemLimit |
| ------------ | -------------------- | ------------- | --------- | --------- |
| `HOME_TABS`  | Хіти продажів        | `BESTSELLING` | 0         | 12        |
| `HOME_TABS`  | Новинки              | `NEWEST`      | 1         | 12        |
| `HOME_TABS`  | Акційні              | `ON_SALE`     | 2         | 12        |
| `HOME_RAILS` | Чохли для смартфонів | `CATEGORY`    | 0         | 12        |
| `HOME_RAILS` | Редакція обирає      | `MANUAL`      | 1         | — (items) |

The three `HOME_TABS` rows reproduce the storefront's former **hardcoded** "Популярне" tabs 1:1 —
titles are copied from `store-client/src/shared/config/dictionary.ts` (`home.popular.tabs.*`) and
`itemLimit: 12` matches the size the hardcoded rail fetched. Tab order = `sortOrder`. Editing these
rows in the admin now changes the homepage tabs; deleting them all leaves the section empty (the
storefront renders correctly with zero carousels).

The BESTSELLING carousel is a **tab**, not a rail: before TASK-288 the seed also created it as a
standalone "Хіти продажів" rail, which would now render the same products twice under the same
heading. Re-seeding an existing dev DB flips that row's `placement` to `HOME_TABS` in place (same
deterministic id).

### Imagery (TASK-365)

Product images and category tiles are **generated on the machine running the seed** — no network,
no third-party placeholder host. Each picture is an SVG (a palette gradient, a rounded plinth on
products, and a category icon) rasterised with `sharp` and then handed to the very same
`ImageProcessor` the admin upload flow uses, so a seeded image gets WebP q80 **and a real base64
LQIP** — seeded rows blur up exactly like uploaded photos instead of popping in.

Files land in `UPLOAD_DEST/products/` (default `apps/store-api/uploads/products/`, which
`ServeStaticModule` serves at `/uploads`). Category tiles share that directory deliberately: both
storefront allowlists match the `/uploads/` **prefix**, not the sub-directory. The resulting URL —
`${PUBLIC_BASE_URL}/uploads/products/seed-<hash>.webp` — is identical in shape to one the admin
panel produces, which is why seeded data needs no special case in `next/image`, in the blur-up
placeholder, or in the admin thumbnail column.

Products are 800×800, category tiles 512×512 (a 2× render of `CategoryTileImage`'s 256 px
intrinsic). The first image (`sortOrder === 0`) of each position is the primary/cover; later sort
orders shift the gradient angle, rotate the icon and add an accent disc, so a three-image gallery
is three visibly different pictures. Positions seeded from a multi-image entry render the
`ProductImageGallery` thumbnail strip (gated on `images.length > 1`), which is what TASK-128-B
enabled for QA.

Filenames are a sha1 of the render recipe, so **re-seeding overwrites identical bytes rather than
accumulating files**; identical icon × palette × sort-order combinations are also encoded only
once per run. A final prune pass then deletes any `seed-<16 hex>.webp` this run did not write.
That pattern cannot match a real upload — `LocalDiskStorageService` names those `<uuid>.<ext>`.

The seed prints the origin it baked into the URLs, once:
`ℹ Seed images: http://localhost:3001/uploads/products/ → <directory>`. **Compare that line with
the storefront's `NEXT_PUBLIC_API_URL` whenever tiles fall back to icons**: `next/image` builds its
allowlist from that variable at build time, and `localhost` is not the same origin as `127.0.0.1`
to it. Under `NODE_ENV=production` an unset `PUBLIC_BASE_URL` is a hard error instead of a default,
so a staging database can never be seeded with `localhost` URLs.

---

## 9. Known constraints

- **`seed-address-1`** is a hard-coded address id used for idempotency. Do not reuse that id for
  test data outside the seed, or the upsert will overwrite your row.
- **Imagery needs no network.** Seed images are rendered locally (§8), so an offline machine gets
  exactly the same pictures as a connected one. What they do need is a **writable `UPLOAD_DEST`**
  and an API served from the `PUBLIC_BASE_URL` the seed logged. Note where those two part company
  on a remote target: the files are written on **whatever machine runs the seed**, while the URLs
  in the database point at the server. Copying them across is a separate, manual step — see §6 and
  [`deploy/03b-test-deploy-no-domain.md`](deploy/03b-test-deploy-no-domain.md) §7.5. Real product
  photos still go through the admin upload flow, not the seed.
- The seed assumes an empty or already-seeded DB. It does **not** delete unrelated rows you may
  have created manually — only seed-owned axes and images are replaced wholesale.
