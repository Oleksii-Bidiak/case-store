-- TASK-559: search synonyms editable from the admin (/settings/search).
--
-- Created EMPTY on purpose. An empty table means "the owner has never saved the
-- list", and search then uses the built-in UA↔EN dictionary in
-- `src/search/search-synonyms.ts` — so this migration changes nothing about how
-- search behaves until someone presses «Зберегти» in the admin. No backfill.

-- CreateTable
CREATE TABLE "search_synonym_groups" (
    "id" TEXT NOT NULL,
    "terms" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_synonym_groups_pkey" PRIMARY KEY ("id")
);
