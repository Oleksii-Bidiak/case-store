---
description: Push Prisma schema to database without creating a migration (dev only)
agent: build
---

Push the current Prisma schema changes to the database without creating a migration file.

**WARNING:** This is for development only. Never use in production.

**Steps:**

1. Generate the Prisma Client to ensure it's up to date:
   ```bash
   npx prisma generate
   ```

2. Push the schema to the database:
   ```bash
   npx prisma db push
   ```

3. If there are conflicts or errors:
   - Review the current schema in `apps/store-api/prisma/schema.prisma`
   - Resolve conflicts manually
   - Re-run `npx prisma db push`

4. Verify with Prisma Studio (optional):
   ```bash
   npx prisma studio
   ```

**Use the @prisma-migration skill for production migration workflows.**