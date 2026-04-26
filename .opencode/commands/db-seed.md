Seed the database with development data.

1. Ensure Docker containers are running: `docker compose up -d`
2. Ensure the Prisma client is up to date: `npx prisma generate --schema=apps/store-api/prisma/schema.prisma`
3. Run the seed script: `npx prisma db seed --schema=apps/store-api/prisma/schema.prisma`
4. If the seed script doesn't exist, check `apps/store-api/prisma/seed.ts` and create it if needed.
5. Verify the data was inserted by checking key tables (users, products, categories).
6. Report the number of records seeded per table.

Use the @prisma-migration skill for seed data conventions.