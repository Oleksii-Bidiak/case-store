---
description: Create and apply a Prisma migration
argument-hint: "<migration-name>"
allowed-tools: Bash(npm run db:*), Bash(npx prisma:*), Read
---

Create and apply a new Prisma migration.

1. Review the current schema changes in `apps/store-api/prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name $ARGUMENTS` (root proxy) — if no name is provided,
   ask for one; never run it without `--name`. A single `--` is enough: the root script
   ends in `--`, so every flag after yours reaches `prisma migrate dev` (TASK-612). Add
   `--create-only` to write the SQL without applying it.
3. Verify the migration was created and applied successfully (the new folder under
   `apps/store-api/prisma/migrations/` must end in `_<name>`).
4. Run `npm run db:generate` (root proxy) to update the Prisma Client.

**`--name` is the only thing that prevents the hang.** Without it `prisma migrate dev`
asks "Enter a name for the new migration" and, in a shell with no TTY and no `CI`
variable (an agent shell), waits forever while its `schema-engine` holds a Postgres
advisory lock — every other migrate against that database then fails with `P1002`.
Closing stdin does **not** help: with `</dev/null` it hangs on the same prompt (tested
live, see [docs/dev-traps.md §2](../../docs/dev-traps.md)). If it already hung: stop
**your own** hung process (Ctrl+C / kill that PID) and, if the lock survives, release it
**only in your own database** as dev-traps §2 shows. Never kill `schema-engine` by name
on a shared machine — that also kills other agents' migrations on `store_postgres`.

If the database has drifted (prisma asks to reset), stop and ask — never reset a shared
database (`store_dev`, `store_test`) on your own. In a non-interactive shell where
`migrate dev` refuses to run at all, generate the SQL with
`npx prisma migrate diff --from-config-datasource --to-schema <schema> --script` instead
(see the **prisma-migration** skill).

Use the **prisma-migration** skill for Prisma best practices.
