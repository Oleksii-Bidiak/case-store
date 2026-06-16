---
description: Seed the database with dev data
allowed-tools: Bash(docker compose:*), Bash(npm run db:*), Bash(npx prisma:*), Read
---

Seed the database with development data.

1. Ensure Docker containers are running: `docker compose up -d`
2. Ensure the Prisma client is up to date: `npm run db:generate` (root proxy)
3. Run the seed script: `npm run db:seed` (root proxy)
4. If the seed script doesn't exist, check `apps/store-api/prisma/seed.ts` and create it if needed.
5. Verify the data was inserted by checking key tables (users, products, categories).
6. Report the number of records seeded per table.

Use the **prisma-migration** skill for seed data conventions.
