---
description: Push Prisma schema to DB (dev only)
allowed-tools: Bash(npx prisma:*)
---

Push the current Prisma schema to the database without creating a migration.

1. Run `npx prisma generate` to ensure the client is up to date.
2. Run `npx prisma db push` to sync schema with the database.
3. Verify the push was successful.
4. Use only for dev — never for production.
