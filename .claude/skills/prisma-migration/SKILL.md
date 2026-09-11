---
name: prisma-migration
description: Create and manage Prisma schema changes and migrations for the e-commerce database. Includes best practices for schema design, migration strategies, and data seeding.
---

## What I Do

I guide the creation and management of Prisma schema changes and database migrations for this e-commerce project. I help design data models, create migrations, and manage the database lifecycle.

## When to Use Me

Use me when:

- Adding new models or modifying the Prisma schema
- Creating database migrations
- Setting up seed data
- Debugging migration issues
- Designing database relationships

## Prisma Location

The Prisma schema is located at `apps/store-api/prisma/schema.prisma`.

All Prisma commands must be run from the `apps/store-api` directory:

```bash
cd apps/store-api
npx prisma <command>
```

Or from the project root using the `-w` flag:

```bash
npx prisma <command> --schema=apps/store-api/prisma/schema.prisma
```

## Schema Design Conventions

### Model Naming

- Use PascalCase for model names: `Product`, `OrderItem`, `UserAddress`
- Use `@@map` to map to snake_case table names: `@@map("product")`, `@@map("order_items")`
- Use `@map` for column overrides when needed

### ID Generation

- Use `@id @default(cuid())` for all primary keys
- Use `@unique` for natural keys like email, slug

### Timestamps

- Always include `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`
- Use `@default(now())` not application-level date assignment

### Deactivation / Soft Delete

Both flags exist in the schema today and they are **independent** — they coexist and mean
different things. Never collapse one into the other.

- **`isActive Boolean @default(true)`** — a **reversible visibility toggle**, admin-only. Present
  on user-facing models (`User`, `Product`, `Category`, `ProductVariant`, `Review`) to
  hide/deactivate a record from the storefront. It can be flipped back on at any time.
- **`deletedAt DateTime?`** — an **audit tombstone** that replaces hard deletes on `User`,
  `Product` and `Order` (each with a supporting index). It is set **once** and **never cleared**;
  a tombstoned record is gone for good. Read paths must filter `deletedAt: null`.

When adding `deletedAt` to a further model, also make any `@@unique` constraint include
`deletedAt` so uniqueness applies only to live records.

### Enum Fields

- Use `enum` for status fields with a fixed set of values
- Define enums outside models at the top level of the schema

### Relationships

- Use explicit relation fields with `@relation` attribute
- Use `onDelete: Cascade` only for true parent-child relationships
- Use `onDelete: Restrict` for most relationships to prevent accidental data loss

### Example Model

```prisma
model Product {
  id              String    @id @default(cuid())
  name            String
  slug            String    @unique
  description     String?
  price           Decimal   @db.Decimal(10, 2)
  compareAtPrice  Decimal?  @db.Decimal(10, 2)
  images          String[]
  inStock         Boolean   @default(true)
  stockQuantity   Int       @default(0)
  isActive        Boolean   @default(true)
  categoryId      String
  category        Category  @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  orderItems      OrderItem[]
  reviews         Review[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([isActive])
  @@map("products")
}
```

> Note: the real `Product` model also carries `deletedAt DateTime?` (audit tombstone, indexed)
> alongside `isActive`, and uses `slug String @unique` directly.

## Migration History Is in Git (since TASK-303)

`apps/store-api/prisma/migrations/*_*/` is **tracked**. It was git-ignored from the first
commit until TASK-303 (2026-07-14) — if you are reading an older doc that says otherwise, it
describes the world before that fix. What TASK-303 found is why this matters: with 1 of 15
migrations in git, staging synchronised its schema with `db push --accept-data-loss`, and a
check against the live Postgres turned up **108 operations of drift** (24 tables existed only
in `schema.prisma`). The closing migration `close_schema_drift_db_push_era` is that catch-all,
which is why it is 570 lines and why several tables have no dedicated migration of their own.

Consequences you must plan around:

- **Migrations are the deployment mechanism.** CI and every environment run
  `npx prisma migrate deploy` — a schema change that is not in a migration does not ship.
- A fresh clone or worktree already has the full history; do not regenerate it.
- Hand-authored migration SQL **is** delivered to teammates and CI. Data backfills belong in a
  migration, written by hand, with a prose comment above the SQL explaining the cause — see
  `20260612120000_product_variant_stock_non_negative/migration.sql` for the house style. The
  rounded `…120000` timestamp is the convention for a hand-written file, as opposed to the
  wall-clock timestamp Prisma generates.
- **Always pass `--config`, never `--schema`.** The DB connection string lives in
  `apps/store-api/prisma.config.ts`, not in `schema.prisma`'s datasource block, so a root-cwd
  `--schema` invocation dies with "datasource.url property is required" before applying
  anything. The working form is
  `npx prisma migrate deploy --config apps/store-api/prisma.config.ts`. (The workspace scripts
  in `apps/store-api/package.json` may use `--schema` because they run with that cwd.)
- `npx prisma migrate reset --config apps/store-api/prisma.config.ts` does **not** seed under
  Prisma 7 (TASK-394) — run the seed as a separate step.

## Migration Workflow

### Development: Schema-First (Recommended)

1. **Edit** the Prisma schema (`schema.prisma`)
2. **Generate** the client: `npx prisma generate`
3. **Create** a migration: `npx prisma migrate dev --name description_of_change`
4. **Verify** the migration was applied correctly

### Production: Migration-First

1. **Create** the migration SQL file manually if needed
2. **Apply** the migration: `npx prisma migrate deploy`
3. **Generate** the client: `npx prisma generate`

### Commands Quick Reference

> Canonical invocation is via the root `npm run db:*` wrappers (they pass
> `--schema=prisma/schema.prisma` for you): `db:generate`, `db:migrate`, `db:push`,
> `db:seed`, `db:studio`. The bare `npx prisma …` forms below assume you are inside
> `apps/store-api`; from the repo root add `--schema=apps/store-api/prisma/schema.prisma`.

```bash
# Create and apply a new migration (dev)
npx prisma migrate dev --name <migration-name>

# Push schema changes without a migration (dev only, no migration history)
npx prisma db push

# Generate the Prisma Client
npx prisma generate

# Reset the database (CAUTION: destroys all data)
npx prisma migrate reset

# View the database in Prisma Studio
npx prisma studio

# Check migration status
npx prisma migrate status

# Apply pending migrations (production)
npx prisma migrate deploy
```

## Naming Migrations

Use descriptive, kebab-case names:

```bash
# Good
npx prisma migrate dev --name add-product-reviews
npx prisma migrate dev --name add-user-addresses
npx prisma migrate dev --name add-order-status-enum

# Bad
npx prisma migrate dev --name update
npx prisma migrate dev --name fix
npx prisma migrate dev --name changes
```

## Seed Data

Create a seed file at `apps/store-api/prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed categories
  const phones = await prisma.category.upsert({
    where: { slug: "phones" },
    update: {},
    create: {
      name: "Phones",
      slug: "phones",
      description: "Phone cases, chargers, and accessories",
    },
  });

  console.log({ phones });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Add to `package.json`:

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

Run: `npx prisma db seed`

## Rules

- ALWAYS use `cuid()` for IDs — never auto-increment integers for public-facing resources.
- ALWAYS add `@@map` to use snake_case table names in the database.
- ALWAYS include `createdAt` and `updatedAt` timestamps on every model.
- NEVER use `@db.Decimal` without specifying precision (use `@db.Decimal(10, 2)` for prices).
- MATCH the existing flag semantics: **`isActive Boolean`** = reversible visibility toggle; **`deletedAt DateTime?`** = write-once audit tombstone replacing hard deletes (`User`, `Product`, `Order`). Never clear a `deletedAt`, and never use `isActive` to fake a delete.
- NEVER use `onDelete: Cascade` on relationships that cross aggregate boundaries.
- ALWAYS name migrations descriptively in kebab-case.
- NEVER use `prisma db push` in production — always use `prisma migrate deploy`.
- ALWAYS regenerate the client after schema changes: `npx prisma generate`.
