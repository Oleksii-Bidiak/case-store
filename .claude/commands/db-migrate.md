---
description: Create and apply a Prisma migration
argument-hint: "<migration-name>"
allowed-tools: Bash(npm run db:*), Bash(npx prisma:*), Read
---

Create and apply a new Prisma migration.

1. Review the current schema changes in `apps/store-api/prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name $ARGUMENTS` (root proxy) — if no name is provided, ask for one.
3. Verify the migration was created and applied successfully.
4. Run `npm run db:generate` (root proxy) to update the Prisma Client.

Use the **prisma-migration** skill for Prisma best practices.
