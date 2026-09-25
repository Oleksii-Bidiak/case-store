---
description: Create and apply a Prisma migration
argument-hint: "<migration-name>"
allowed-tools: Bash(npm run db:*), Bash(npx prisma:*), Read
---

Create and apply a new Prisma migration.

1. Review the current schema changes in `apps/store-api/prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name $ARGUMENTS </dev/null` (root proxy) — if no name is
   provided, ask for one. A single `--` is enough: the root script ends in `--`, so every
   flag after yours reaches `prisma migrate dev` (TASK-612). Add `--create-only` to write
   the SQL without applying it.
3. Verify the migration was created and applied successfully (the new folder under
   `apps/store-api/prisma/migrations/` must end in `_<name>`).
4. Run `npm run db:generate` (root proxy) to update the Prisma Client.

**Always redirect stdin (`</dev/null`) when an agent runs this.** `prisma migrate dev` is
interactive: without a name, or on drift that needs a reset, it waits for an answer on
stdin. With no TTY it can sit there forever while its `schema-engine` holds a Postgres
advisory lock, and the next migrate against that database then fails with `P1002`
(timeout acquiring the lock). With stdin closed it fails fast instead. If it already hung:
kill the leftover `schema-engine` process before retrying.

If the database has drifted (prisma asks to reset), stop and ask — never reset a shared
database (`store_dev`, `store_test`) on your own. In a non-interactive shell where
`migrate dev` refuses to run at all, generate the SQL with
`npx prisma migrate diff --from-config-datasource --to-schema <schema> --script` instead
(see the **prisma-migration** skill).

Use the **prisma-migration** skill for Prisma best practices.
