-- TASK-2626: a catalogue-import row whose write threw used to be only logged — it still
-- counted towards `applied_rows` and the history's counters, so the operator never learnt
-- the product was not written. Rows that failed are now recorded here per run.
-- Left NULL on existing runs on purpose: NULL marks a run applied before this column, whose
-- counters are the plan; `[]` and up is the per-row record.

-- AlterTable
ALTER TABLE "catalog_import_runs" ADD COLUMN "failures" JSONB;
