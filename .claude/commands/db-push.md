---
description: Push Prisma schema to DB (dev only)
allowed-tools: Bash(npm run db:*), Bash(npx prisma:*)
---

Push the current Prisma schema to the database without creating a migration.

1. Run `npm run db:generate` (root proxy) to ensure the client is up to date.
2. Run `npm run db:push` (root proxy) to sync schema with the database.
3. Verify the push was successful.
4. Use only for dev — never for production.
