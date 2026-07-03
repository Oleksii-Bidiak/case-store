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

- **Current convention:** this project uses an **`isActive Boolean @default(true)`** flag on
  user-facing models (`User`, `Product`, `Category`, `ProductVariant`, `Review`) for
  hide/deactivate, plus **hard deletes** for real removal. There is **no `deletedAt`** column
  anywhere in the schema today — do not assume one exists.
- **Roadmap (not yet implemented):** `deletedAt DateTime?` soft deletes are a planned
  improvement (backlog TASK-104). If/when adopted, add `@@unique` constraints that include
  `deletedAt` so uniqueness applies only to active records. Until then, match the existing
  `isActive` pattern.

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

> Note: this mirrors the live schema's `isActive`-based deactivation (no `deletedAt`). The
> real `Product` model uses `slug String @unique` directly.

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
- MATCH the existing **`isActive Boolean`** deactivation pattern on user-facing models; the schema has **no `deletedAt`** today (soft deletes are roadmap TASK-104, not current).
- NEVER use `onDelete: Cascade` on relationships that cross aggregate boundaries.
- ALWAYS name migrations descriptively in kebab-case.
- NEVER use `prisma db push` in production — always use `prisma migrate deploy`.
- ALWAYS regenerate the client after schema changes: `npx prisma generate`.
