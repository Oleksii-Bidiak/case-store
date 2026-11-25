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

| Command               | What it does                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run db:seed`     | Run the seed script against the current DB (no schema change). Idempotent — with one one-off TASK-397 caveat, see §3.  |
| `npm run db:migrate`  | `prisma migrate dev`: create a migration from schema changes and apply it. Pass `-- --name <name>`. **Does not seed.** |
| `npm run db:push`     | Push the schema to the DB without creating a migration (rapid dev only).                                               |
| `npm run db:studio`   | Open Prisma Studio to browse/edit seeded data in the browser.                                                          |
| `npm run db:generate` | Regenerate the Prisma Client after a schema change.                                                                    |

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

Re-running `npm run db:seed` on a populated DB is **safe** — it will not create duplicates, with
one one-off exception for DBs seeded **before TASK-397** (see the warning at the end of §3):

- **Users, categories, products, addresses** are written with `upsert` keyed on a stable
  natural key (`email`, `slug`, and the fixed `seed-address-1` id for the demo address).
- **Reviews** are replaced wholesale, not upserted: the seed deletes every review owned by its 23
  seeded reviewer accounts (`deleteMany` scoped to those `userId`s) and recreates them. Reviews
  written by real users are never touched — the delete is scoped by author, not by product.
  The three **verified-purchase** reviews (TASK-409) are the exception: they are written by demo
  CUSTOMER accounts, so only their exact `(user, product)` pairs are replaced — anything else those
  accounts wrote by hand survives. They exist because the «Підтверджена покупка» badge is computed
  («does this author have an order containing this product?»), and a review from a `reviewerN@`
  account can never satisfy it. The pairs are derived from the delivered orders in
  `prisma/seed/data/orders.data.ts`, minus every line that is returned, sent to repair or
  refunded (TASK-2569) and minus guest orders, so they follow automatically when those orders
  change. Open any of these three to see the badge: `apple-iphone-15-pro-256gb-blue`,
  `car-charger-baseus-30w-black`, `cable-ugreen-usbc-100w-1m`. The seed prints their SKUs on every
  run (`IP15PRO-256-BT`, `CHG-BSU-CAR30-BK`, `CAB-UGR-CC100-1M`).
  The moderation states (TASK-2569) — two rejected texts, the shop's three replies, the hidden
  author `reviewer20@`, the rating burst and the 1★ run — are all pool rows, so they are deleted
  and rebuilt with the pool; replies cascade with their review and are written again after it.
- **Product groups** upsert on a deterministic UUID derived from the entry slug
  (`deterministicUuid(slug)`), so groups stay stable across runs of the same code. TASK-397
  changed that derivation, so a slug now maps to a **different** id than it did before — see the
  warning at the end of this section.
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
- **Orders** (including both halves of the two order copies) upsert on `deterministicUuid('order-<key>')`;
  **items** upsert on `order-item-<key>-<n>` and a line the data no longer declares is deleted;
  item **add-ons** and the **status-history** trail are deleted + recreated per run; the **discount
  redemption** upserts on its unique `orderId`, and `Discount.redeemedCount` is recounted from the
  redemptions on every run. Everything that hangs off a seeded order and has no natural key —
  the **money ledger** (`OrderMoneyEntry`, reversals first), **returns** with their items, decision
  and repair events, and the **LiqPay `Payment` rows** — is deleted and rewritten at deterministic
  ids (`money-<key>-<n>`, `payment-<key>-<n>`, `return-<key>`, `return-item-…`,
  `return-decision-…`, `return-repair-…`, `money-return-…`). The five money columns, the payment
  status and the order status are then derived by the domain's own `OrderMoneyRepository.recompute`;
  a plan that disagrees with it rolls the order back with a readable error.
- **Order dates are relative to the run and rewritten every time.** Each order is placed
  `daysAgo` before "now", and its history, money, payments and returns are offsets from that, so
  a stand re-seeded today shows "3 days ago" again, not the date of the first seed. The same holds
  for scheduled content (banner, carousel, blog post, `NEWYEAR15`), saved devices' `lastUsedAt` and
  the review burst — see «Demo-day re-seed» in §8.
- **Staff** (TASK-2569): permission templates upsert on their unique `name` and their items are
  replaced wholesale; the two managers upsert on `email`, and their whole permission set is
  replaced with the template's, as «Застосувати шаблон» does. The apply's audit row upserts on
  `deterministicUuid('audit-template-apply-<email>')`.
- **Delivery settings** upsert on the singleton's fixed id (`…0003`) and write only the fields the
  seed owns — the four method switches and the courier terms; the Nova Poshta sender block is the
  operator's and is left alone. **Pickup points** upsert on `deterministicUuid('pickup-point-<key>')`.
  The Nova Poshta city and branch refs of the seeded orders were fetched once from the public NP
  API and are frozen in `prisma/seed/data/delivery.data.ts` — the seed never goes to the network.
- **Saved devices** upsert on `(userId, deviceModelId)` and their settings row on `userId`; a
  device the customer added through the storefront stays. **Category addon templates** on the
  seeded categories and **addon deltas** on the seeded services are replaced wholesale.
- **Site settings:** the messenger links and the store logo are filled **only when empty** — a
  logo an operator uploaded is never replaced. **Media assets** upsert by URL with `update: {}`, so
  alt text or tags edited in the library survive a re-seed.

Because images are `deleteMany`-then-recreate per position, a crash mid-loop could leave a position
with no images. Recovery is simply re-running `npm run db:seed`.

> ⚠️ **The one case that is NOT idempotent: the catalogue itself changed between runs.**
> Positions upsert on `slug`, but `Product.sku` is `@unique` too. If a new catalogue revision
> reuses an SKU under a different slug, the upsert finds nothing, takes the `create` branch and
> dies on `Unique constraint failed on the fields: (sku)` — halfway through `seedProducts`, which
> is step 6 of 20, so most seeders never run and `pruneSeedImages()` never cleans up. This is
> exactly what TASK-366 (2026-07-30) did: it replaced the English demo catalogue with the
> Ukrainian one and moved 9 iPhone SKUs onto new slugs. A DB seeded before that date cannot be
> re-seeded in place — reset it first (§5). The same applies to any future catalogue swap.
>
> Related: the seed never deletes rows it no longer owns, so positions dropped from the catalogue
> stay in the DB as live, `isActive: true` orphans (see §9).

> ⚠️ **The one-off case: a DB seeded before TASK-397.** That task made `deterministicUuid` emit a
> real v4 (it used to leave the version and variant nibbles to the sha1 digest), so the same seed
> key now maps to a **different** id — and every row keyed on it upserts **by id**: product groups,
> orders, the demo address, banners, carousels, contact messages. Re-seeding an older DB therefore
> writes a second copy of those rows beside the old ones instead of updating them. Reset it once
> (§5); after that, re-seeding is safe again. A DB first seeded on TASK-397 code or later is not
> affected.

> ⚠️ **A DB seeded before TASK-2569 keeps its old verified-purchase reviews.** The seed only
> upserts the verified pairs and never deletes one the data no longer derives, so on an older
> stand the old 4–5★ «Підтверджена покупка» reviews stay on lines that are now returned or in
> repair (john's and dmytro's chargers, nataliia's case). Cleaning them up is TASK-2604; until
> then, reset the DB (§5) if the demo must not show them.

---

## 4. After a Prisma migration

When you change `prisma/schema.prisma`:

```bash
npm run db:migrate -- --name add_foo_column   # creates + applies the migration — nothing else
npm run db:seed                               # only if you want the fixtures refreshed too
```

**Prisma 7 no longer seeds after `migrate dev`** (nor after `migrate reset`, see §5): the
automatic seed and its `--skip-seed` flag were removed in v7. The `migrations.seed` entry in
`prisma.config.ts` is now read only by `prisma db seed`, i.e. by `npm run db:seed`. Older notes
that say "`db:migrate` reseeds in one step" predate the upgrade. If you only changed seed data (no
schema change), skip the migration and run the seed alone.

The single `--` matters: it hands `--name` through the root script to `prisma migrate dev`. Omit
the name and Prisma stops to ask for one — see the next subsection for what that does to a shell
without a terminal.

After any schema change, regenerate the client so TypeScript stays in sync (`migrate dev` no
longer does this either in Prisma 7):

```bash
npm run db:generate
```

### If `migrate dev` hangs, or fails with P1002

Without `--name`, `prisma migrate dev` prints `? Enter a name for the new migration: »` and
stops there — and it asks even when there is no terminal to answer it (an agent shell, a piped
shell, a script), so it waits forever. Closing stdin does **not** help: `</dev/null` still hangs
at the same prompt. The only environment where it does not ask is one with a CI variable set
(`CI=true`, as on GitHub Actions): there it skips the prompt and silently creates a migration with
an empty name instead. While it waits, the schema
engine holds Postgres advisory lock `72707369`, and as long as that process (or an orphaned
`schema-engine`) is alive, every other `migrate dev`/`deploy`/`reset` against that database times
out with **P1002** ("Timed out trying to acquire a postgres advisory lock"). The only thing that
prevents the hang is passing the name:

```bash
npm run db:migrate -- --name add_foo_column
```

If P1002 is already happening, stop the process that holds the lock, scoped to your own
database — other agents may be migrating their own databases on the same Postgres at the same
time. Commands and the full explanation are in [dev-traps.md](dev-traps.md) §2.

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

To drop, recreate and migrate (from the repo root), then seed as a second step:

```bash
npx prisma migrate reset --config apps/store-api/prisma.config.ts
npm run db:seed
```

This wipes **all** data in the target database. **Never run `migrate reset` against a production
or shared database** — it is destructive and irreversible. It asks for confirmation first;
`--force` skips that prompt, so keep it out of anything you paste half-awake.

Two things that used to be wrong here, both worth knowing because the old forms fail in
non-obvious ways:

- **`--config`, not `--schema`.** The `datasource` block in `schema.prisma` carries no `url` —
  the connection string lives only in `prisma.config.ts`. Point Prisma at the schema alone and
  it has no idea what to connect to.
- **Reset no longer reseeds.** Prisma 7 removed the automatic seed after `migrate reset` (and
  the `--skip-seed` flag along with it), so seeding is always its own explicit step. Any snippet
  that still passes `--skip-seed` predates v7.

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
creates the demo customers, the two managers and the 23 reviewer accounts with the fixed
passwords listed below —
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

Why it is built this way, and what would replace the manual step, is in §10.

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

### Сів робить сіяного адміна ще й ВЛАСНИКОМ магазину

З хвилі 181 роль `ADMIN` — це лише **заступник**. Влада живе на окремому прапорці
`User.isOwner`, і власник у магазині рівно один: це забезпечує частковий унікальний
індекс `users_single_owner_key`. Сів ставить цей прапорець сіяному адміну на **обох**
половинах upsert — інакше перший же пересів наявного стенду лишив би магазин без
власника, і це не було б видно доти, доки комусь не знадобиться передати власність
або призначити другого адміна.

> **Якщо сів упав із `Ownership of the shop is currently held by …`** — власником стоїть
> інший акаунт. Найчастіше це означає, що на стенді справді робили передачу власності
> (ручна перевірка **AD-STAFF-13**). Сів свідомо **не** забирає власність назад: хто
> керує магазином — не те рішення, яке ухвалює скрипт. Два виходи: передати власність
> назад сіяному адміну через «Персонал» → картка → «Передати власність», або скинути
> базу (§5). Це перший сідер, тож поки він падає, решта даних не сіється взагалі.

### Two managers, not a second admin (TASK-2569)

The seed creates two staff accounts — `orders@store.com` (Ірина Мельник) and
`content@store.com` (Андрій Савчук) — with role **MANAGER** and the customers' already-published
password `Customer123!`, so it introduces no new credential. Each one's rights are copied from a
seeded permission template, exactly as «Застосувати шаблон» does it (with the `:read` partner of
every `:write`): «Оператор замовлень» (10 permissions: orders, payments and refunds, returns,
customers read-only, messages, analytics) and «Контент-менеджер» (22: catalogue, blog, pages,
banners, carousels, homepage, FAQ, reviews, media library). The owner is recorded in the audit
log as having applied each template.

They are managers on purpose: an ADMIN holds every key by level, so a second admin would show
nothing of what the access model is for. `orders@` is also the author of the operator's steps in
the seeded order histories and money entries; `content@` signs one of the shop's review replies.

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
> Do not reuse that address for anything new — the seeded managers above deliberately have other
> emails, so an old row can never be mistaken for one of them.

### Seeded login credentials

| Role     | Email                  | Password       | Notes                                                     |
| -------- | ---------------------- | -------------- | --------------------------------------------------------- |
| Admin    | `admin@store.com`      | `Admin123!`    | Олександр Коваленко, owner (env-overridable)              |
| Manager  | `orders@store.com`     | `Customer123!` | Ірина Мельник — template «Оператор замовлень» (10 rights) |
| Manager  | `content@store.com`    | `Customer123!` | Андрій Савчук — template «Контент-менеджер» (22 rights)   |
| Customer | `customer@store.com`   | `Customer123!` | Demo account (John Doe); 3 saved devices                  |
| Customer | `oksana@example.com`   | `Customer123!` | Оксана Шевченко; 2 saved devices, the copy with «Залік»   |
| Customer | `taras@example.com`    | `Customer123!` | Тарас Бондаренко; 1 saved device, the partial payment     |
| Customer | `mariia@example.com`   | `Customer123!` | Марія Коваль; the order REFUNDED through returns          |
| Customer | `dmytro@example.com`   | `Customer123!` | Дмитро Ткаченко                                           |
| Customer | `nataliia@example.com` | `Customer123!` | Наталія Кравченко; the overpayment, the rejected return   |

Only the admin's email/password are configurable (via the env vars above). Everything else is
fixed — the managers' email and password included. The 20 approved-review accounts (`reviewer1@store.com` … `reviewer20@store.com`) and 3
pending-review accounts (`pending-reviewer1@store.com` … `pending-reviewer3@store.com`) all use
password `Reviewer123!` and are not configurable.

---

## 8. What gets seeded

A clean seed produces:

| Entity                     | Count | Notes                                                                                                                                                                                                         |
| -------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users                      | 32    | 1 admin (the owner) + 2 managers + 6 customers + 20 reviewers + 3 pending-review accounts (§7)                                                                                                                |
| Permission templates       | 2     | «Оператор замовлень» (10 keys) and «Контент-менеджер» (22 keys) — 32 template items; TASK-2569                                                                                                                |
| User permissions           | 32    | The two managers' sets, copied from the templates (10 + 22)                                                                                                                                                   |
| Audit log rows             | 2     | One `permissionTemplate.apply` per manager, authored by the owner                                                                                                                                             |
| Brands                     | 16    | Apple, Samsung, Xiaomi, Huawei, Sony, JBL, Anker, Baseus, Belkin, Spigen, Nillkin, Hoco, Borofone, UGREEN, SanDisk, Remax (TASK-189/366)                                                                      |
| Categories                 | 43    | 11 Ukrainian roots + 32 subcategories (TASK-366). Only `iPhone` and `Samsung Galaxy` are Latin — proper nouns; every root carries its sprite `icon` key, subcategories none (TASK-1956)                       |
| Product groups             | 58    | Multi-variant entries become groups (variant-as-position, TASK-142); axes are Ukrainian — «Колір», «Пам'ять», «Довжина», «Комплект», «Об'єм»                                                                  |
| Product positions          | 178   | Group members + standalone. 14 with `stock = 0` (sold-out UI), 23 with 1–4 (low-stock widget), 79 with a `compareAtPrice`                                                                                     |
| Product images             | 381   | Generated locally into `UPLOAD_DEST/products/` as WebP + LQIP (TASK-365) — see Imagery below                                                                                                                  |
| Media assets               | 173   | Every distinct seed-rendered file — product photos, category tiles, banners, blog covers, the logo — registered in the media library (TASK-1029), upsert by URL                                               |
| Attribute definitions      | 58    | Declared on all 11 ROOT categories, inherited down each subtree; 37 of them filterable (TASK-191/366)                                                                                                         |
| Attribute values           | 898   | Every one of the 178 positions carries at least 3 filled specs — fewer and the facets read empty                                                                                                              |
| Addon services             | 6     | 5 active + 1 inactive («Експрес-ремонт за 24 години») — the inactive one never reaches checkout                                                                                                               |
| Category addon templates   | 7     | «Смартфони» 3, «Samsung Galaxy» 2 (a child template **replaces** its parent's), «Навушники» 2                                                                                                                 |
| Addon deltas               | 4     | ADD / REMOVE / OVERRIDE on **named** positions (three iPhones and an Apple Watch)                                                                                                                             |
| Device brands              | 3     | Compatible-device taxonomy (Apple / Samsung / Xiaomi) — distinct from product Brands, TASK-190                                                                                                                |
| Device models              | 40    | Grouped by `series` for the storefront ModelPicker cascade; 4 carry SEO copy (iPhone 15 Pro, Galaxy S24, iPad Air 11" (M2), Apple Watch Series 10 42mm)                                                       |
| Device compat links        | 192   | Accessories ↔ models across 33 catalogue entries (`ProductDeviceCompat`, TASK-190); 49 of them on the 5 iPad models — USB-C items only, the catalogue has no iPad cases                                       |
| Saved devices              | 6     | «Мої пристрої» of 3 customers: `customer@` 3 (iPhone 15 Pro active, an iPad and «Мама»'s Galaxy), `oksana@` 2, `taras@` 1; + 2 settings rows                                                                  |
| Banners                    | 8     | 6 PUBLISHED, 1 SCHEDULED (promo tile «Ремінці для Apple Watch», +7 days), 1 DRAFT (hero slide); 7 with generated art, the announcement bar is text only (TASK-186)                                            |
| **Carousels**              | **7** | **3 tabs of «Популярне» + 3 rails (one SCHEDULED with its block) + 1 DRAFT, shown through homepage blocks — see below (TASK-139, TASK-660)**                                                                  |
| Carousel items             | 4     | Hand-picked products on the MANUAL rail; replaced wholesale on re-run (which four is not yet deterministic — TASK-2603)                                                                                       |
| Home blocks                | 10    | The 7 blocks the migration creates + 3 `CAROUSEL` blocks (one SCHEDULED); 3 tabs on the `TABS` block                                                                                                          |
| Reviews (pool)             | 2 203 | 5–20 per position, deterministic, ratings skewed positive. Of them 2 have their text REJECTED (the rating stays) and the 9 by `reviewer20@` are hidden by a moderator                                         |
| Reviews (pending)          | 6     | Text PENDING with UA comments, on six **named** positions — the admin moderation queue is always exactly these six                                                                                            |
| Reviews (verified)         | 3     | Written by the customers who placed the **delivered** orders, so «Підтверджена покупка» is visible — see §3 (TASK-409)                                                                                        |
| Reviews (abuse signals)    | 15    | 12 rating-only 5★ in a quarter-hour on `powerbank-hoco-10000-cables` + 3× 1★ from one account and IP `203.0.113.42` — time-limited, see «Demo-day re-seed»                                                    |
| Review replies             | 3     | The shop's answers: 2 by the owner, 1 by `content@`                                                                                                                                                           |
| Discounts                  | 8     | WELCOME10, SUMMER500 (min 3000), VIP20 (private), EXPIRED15 (past), OLDPROMO (inactive), NEWYEAR15 (starts in 5 days), FLASH300 (used up 2 of 2), AUDIO7. The «Акції» page lists WELCOME10, SUMMER500, AUDIO7 |
| Delivery settings          | 1     | Singleton: all 4 methods on, courier in Київ 150 грн, free from 3000 грн                                                                                                                                      |
| Pickup points              | 3     | 2 active (Київ, Львів) + 1 inactive                                                                                                                                                                           |
| Orders                     | 22    | 18 + 4 from the two copy pairs. Every OrderStatus and PaymentStatus, all 4 delivery methods (Nova Poshta with real city/branch refs) and all 4 payment methods; deterministic ids                             |
| Order items                | 30    | Price captured at purchase; 3 add-ons on the lines                                                                                                                                                            |
| Discount redemptions       | 5     | WELCOME10, SUMMER500, VIP20 and FLASH300 twice (unique per order)                                                                                                                                             |
| Order status history       | 99    | Append-only STATUS + PAYMENT_STATUS trails; operator steps signed by `orders@`                                                                                                                                |
| Order money entries        | 23    | The ledger (R2): every IN kind, a reversed (сторно) courier receipt, a partial payment, an overpayment with its reason, refunds and the «Залік» pair                                                          |
| Payments (LiqPay attempts) | 7     | 6 SUCCEEDED + 1 FAILED (the bank decline the reconcile worker cancelled)                                                                                                                                      |
| Order copies               | 2     | One cancelled its paid original and took 1299 грн as «Залік»; one is a repeat order that leaves its original alone                                                                                            |
| Returns                    | 9     | On 8 orders: every ReturnStatus and every decision, 3 payouts; 9 items, 9 decision events, 9 repair events (all 4 repair steps). Both lines of one order back → that order is REFUNDED                        |
| Contact messages           | 7     | NEW / READ / IN_PROGRESS / ARCHIVED / SPAM (TASK-177)                                                                                                                                                         |
| Newsletter subscribers     | 7     | 5 SUBSCRIBED (one without a source) + 2 UNSUBSCRIBED (TASK-188)                                                                                                                                               |
| Pages                      | 19    | 18 PUBLISHED + 1 DRAFT (`info-pickup`, «Самовивіз»), TASK-187                                                                                                                                                 |
| Blog categories / authors  | 5 / 5 | UA; categories upsert on `slug`, authors on `name`                                                                                                                                                            |
| Blog posts                 | 14    | UA: 12 PUBLISHED, 1 SCHEDULED (+7 days), 1 DRAFT; exactly 1 featured; every post has a generated cover                                                                                                        |
| FAQ items                  | 7     | 6 active UA Q&A (TASK-242) + 1 inactive                                                                                                                                                                       |
| Site contact settings      | 1     | Singleton row (fixed id `…0001`), TASK-154; messenger links filled only when empty                                                                                                                            |
| SEO settings               | 1     | Singleton row (fixed id `…0002`), TASK-239; the store logo is set from the media library only when `logoUrl` is empty                                                                                         |
| Addresses                  | 8     | `seed-address-1` (John) + 1–2 UA addresses per new customer (deterministic ids)                                                                                                                               |

### Homepage carousels and blocks (TASK-288, TASK-660)

Since TASK-660 a carousel has no placement: it shows on the homepage only through a **homepage
block** (`home_blocks`) — a tab of a `TABS` block or its own `CAROUSEL` block. The seed writes
both the carousels and the blocks that show them; `sortOrder` on a carousel is just its position
in the one admin list:

| On the homepage                | Title                | Source        | sortOrder | itemLimit |
| ------------------------------ | -------------------- | ------------- | --------- | --------- |
| tab 1 of the «Популярне» block | Хіти продажів        | `BESTSELLING` | 0         | 12        |
| tab 2 of the «Популярне» block | Новинки              | `NEWEST`      | 1         | 12        |
| tab 3 of the «Популярне» block | Акційні              | `ON_SALE`     | 2         | 12        |
| its own `CAROUSEL` block       | Чохли для смартфонів | `CATEGORY`    | 3         | 12        |
| its own `CAROUSEL` block       | Редакція обирає      | `MANUAL`      | 4         | — (items) |
| its own block, SCHEDULED +7 d  | Заряд у дорогу       | `CATEGORY`    | 5         | 8         |
| nowhere (DRAFT, no block)      | Подарунки меломанам  | `CATEGORY`    | 6         | 8         |

The scheduled rail and its block share one `scheduledAt`, a week after the run: the storefront
shows a block only once both it and its carousel are live, so the rail appears on its own date and
not before (TASK-2569).

The three tabs reproduce the storefront's former **hardcoded** "Популярне" tabs 1:1 — titles are
copied from `store-client/src/shared/config/dictionary.ts` (`home.popular.tabs.*`) and
`itemLimit: 12` matches the size the hardcoded rail fetched. The system blocks (slider, trust strip,
categories, promo banner, «Ви переглядали», newsletter) come from the `…_home_blocks` migration; the
seed only creates one if it is missing. A re-run never reshuffles an existing page: tabs upsert on
(block, carousel) and a `CAROUSEL` block is created only when no block shows that carousel yet.

The BESTSELLING carousel is a **tab**, not a rail: an identical "Хіти продажів" rail underneath the
tab it duplicates would render the same products twice under the same heading.

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

Two more shapes come from the same generator (TASK-2569). **Banners and blog covers** are one
wide 1600×720 render (20:9): it covers the hero art box (≈2.2:1) and the full-width promo banner at
retina density, and the promo tiles and blog cards crop it with `object-cover`. The **store logo**
is a 512×512 monogram «C» drawn as a path, not text, so every machine writes the same bytes. All
of them land in the same `UPLOAD_DEST/products/` directory under the same `seed-<hash>.webp`
naming and are registered in the media library, so the prune pass and the library cover them
unchanged. The old `/images/banners/…` links of the seeded banners are gone — no app served
those paths — and every banner except the text-only announcement bar now has real art.

The seed sets the logo **only when `logoUrl` is empty**, from the library asset it just
registered. On the storefront a logo **replaces the letter mark and the store-name wordmark** in
the header — so a stand seeded once shows the image only, and an operator who wants the name back
removes the logo in the SEO settings of the admin.

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

### Demo-day re-seed (TASK-2569)

Part of the seed is a picture of "right now", so **seed on the day you show it**:

- **The rating burst lives about 45–50 minutes.** Its 12 rows are written inside the last quarter
  of an hour, and the dashboard flags a product only while more than 10 ratings fall into one
  hour (`RATING_BURST_*` in `src/dashboard/dashboard.types.ts`). Seed it last, shortly before the
  dashboard is on screen.
- **The 1★ run lives about 20 hours** (three ratings two to four hours old, a 24-hour window).
- **Everything else is relative and rewritten each run** (§3): orders stay "3 days ago", the
  «Довго в очікуванні (>48 год)» tile keeps its two orders, the scheduled banner, rail and post
  stay a week away, `NEWYEAR15` stays five days away, the active saved device stays the most
  recent one.

A re-seed is safe on a stand (§3), but it does put back every seeded row an operator edited
(§9). On a remote stand use the SSH-tunnel procedure in §6.

---

## 9. Known constraints

- **Re-seeding overwrites admin edits on seeded rows.** The seed is idempotent (a second run adds
  nothing), but it is not a top-up: every seeded product gets its name, description, `metaTitle`
  and all its spec values back, every seeded blog post its title, body and author, every attribute
  definition its `isFilterable`. Whatever an owner or tester changed in those rows on a shared
  stand is lost. Only `siteName` is filled strictly when empty. Run `db:seed` on a stand only when
  losing those edits is agreed. A changed `isFilterable` reaches the storefront up to 5 minutes
  later (the `filterable-specs` cache). Field-level protection is TASK-1181.
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

---

## 10. What the pipeline seeds vs what a human enters (TASK-328)

The question behind this section came from the owner during the 2026-07-21 demo: _"do companies
really enter the seed by hand?"_ They do not — but of the three kinds of data a shop holds, only
two belong in a pipeline, and only one of those on production. Keeping them apart is the
decision; the manual step we have today is a consequence of it plus one temporary gap.

### Three classes of data

| Class                                                    | Where it comes from                             | Automated?                     | In this repo                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Reference data** — rows the code cannot run without | **Migrations**, on every environment incl. prod | Yes — `prisma migrate deploy`  | **Practically none, and that was checked, not assumed.** Order/payment/return statuses and the like are Prisma **enums** in `schema.prisma`, not lookup tables. Both settings singletons default themselves: `SeoSettingsService` and `SiteContactService` return `SeoSettingsEntity.empty()` / `SiteContactSettingsEntity.empty()` when the row is missing, and their repositories `upsert` on the first save. Nothing needs moving into a migration. |
| **2. Fixtures** — demo catalogue, demo accounts, orders  | **The seeder** (`prisma/seed.ts`, §3–§8)        | Should be — **never on prod**  | Fixed, published passwords (§7) make it a hazard anywhere real customers live; `assertSeedAllowed()` (§6) refuses production unless explicitly overridden for a fresh staging/demo box.                                                                                                                                                                                                                                                                |
| **3. The client's real catalogue**                       | **The admin panel and the catalogue import**    | **Never through the pipeline** | It belongs to the business, changes daily and has nothing to do with the code version. Put it in a pipeline and a price change becomes a release — and the admin panel becomes pointless.                                                                                                                                                                                                                                                              |

So on production a pipeline runs migrations and nothing else; fixtures exist only on
dev/staging/demo; and the catalogue is entered by people.

### Why class 2 is still a manual step today

Two reasons, and only one of them is temporary:

- **Deliberate: the production image cannot seed itself.** `apps/store-api/Dockerfile` runs
  `npm prune --omit=dev` in the `build` stage, which removes `tsx` (the seed's runner), and the
  `runner` stage copies `dist/` and `prisma/` but **not `src/`** — while the seeders import
  `src/common/sanitize` (`prisma/seed/seeders/pages.seeder.ts`, `blog.seeder.ts`). That is a
  safeguard, not an oversight: an image that ships to production has no business creating
  accounts whose passwords are printed in this file.
- **Temporary: nothing else could run it.** There are no ephemeral environments, and GitHub
  Actions is billing-locked (TASK-491), so no workflow can execute a seed job even if one existed.

Until the follow-ups below land, the SSH-tunnel procedure in §6 is **the only working way** to
seed a remote environment. Do not remove it from this guide or from
[`deploy/03b-test-deploy-no-domain.md`](deploy/03b-test-deploy-no-domain.md) §7.

### Target design (follow-up work, not implemented)

**A — a separate seeder image, production image unchanged.**

- Split the Dockerfile stages: `build` (full install, compile — **no prune**) → `prod-deps`
  (`npm prune --omit=dev` on a copy) → `runner` (copies from `prod-deps` + `dist/`), so the
  runner stays **byte-identical** to today's.
- Add a `seeder` stage `FROM build`: it has `tsx`, `src/` and `prisma/`, and its command is
  `prisma db seed`.
- Expose it in compose as a service under the profile `seed`, so a normal `docker compose up`
  never starts it and seeding is an explicit `docker compose --profile seed run --rm seeder`.
- The `seeder` image is **not pushed to GHCR** — it is built on the box that needs it.

**B — a `seed-staging` job in CI.**

- Trigger: `workflow_dispatch` only, behind the `staging` environment gate — never on push.
- After seeding, **restart `store-api`**: the seeder writes to Postgres behind the app's back, so
  Redis keeps serving the cached empty responses and Meilisearch keeps an empty index until the
  app rebuilds them.
- Fail on the **result**, not on the exit code: query `count(products)` afterwards and fail the
  job when it is `0`. A seed that exits 0 having written nothing is exactly the failure a green
  job would hide.

Both are tracked as separate BACKLOG rows. Until they exist, "the pipeline seeds staging" is not
true, and nothing in the docs should imply it.
