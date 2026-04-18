---
description: Create and apply a new Prisma database migration
agent: build
---

Create and apply a new Prisma migration for schema changes.

**Arguments:** $ARGUMENTS — the migration name (e.g., "add-product-reviews")

**Steps:**

1. Review the current schema to understand what changed:
   ```bash
   git diff apps/store-api/prisma/schema.prisma
   ```

2. If no migration name was provided, ask the user for one. Use descriptive kebab-case names.

3. Create the migration:
   ```bash
   npx prisma migrate dev --name $ARGUMENTS
   ```

4. Verify the migration was created successfully. Check:
   - `apps/store-api/prisma/migrations/` for the new migration folder
   - The generated SQL file makes sense

5. Regenerate the Prisma Client:
   ```bash
   npx prisma generate
   ```

6. Run tests to verify nothing broke:
   ```bash
   npm run test -w apps/store-api
   ```

**Migration naming conventions:**
- `add-product-reviews` — adding a new feature
- `add-user-addresses` — adding a new relation
- `add-order-status-enum` — adding an enum
- `rename-category-to-product-category` — renaming

**Use the @prisma-migration skill for detailed schema design guidance.**