-- TASK-2045 (R1, repair in steps).
--
-- WHAT  a unique index on return_repair_events (return_id, step), replacing the plain
--       index on return_id (the unique index's leading column serves those lookups).
-- WHY   each repair step happens once. The service checks the order of steps against a
--       read taken outside the write, so two clicks on the same step both pass it; this
--       index makes the second insert fail, and the API answers 409
--       RETURN_REPAIR_STEP_INVALID. The table is new in 20261031120000 and holds no rows
--       yet, so no existing data can violate it.
--
-- DDL below generated with `prisma migrate diff --from-config-datasource --script`.

-- DropIndex
DROP INDEX "return_repair_events_return_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "return_repair_events_return_id_step_key" ON "return_repair_events"("return_id", "step");
