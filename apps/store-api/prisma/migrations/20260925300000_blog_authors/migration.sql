-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "author_id" TEXT;

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authors_name_key" ON "authors"("name");

-- CreateIndex
CREATE INDEX "blog_posts_author_id_idx" ON "blog_posts"("author_id");

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Backfill (hand-written, TASK-554) ────────────────────────────────────────
-- Every existing article already names its author in "author_name". Create one
-- Author per distinct trimmed name and link each post to it, so no article is
-- left without its author row after deploy. The key is btrim(author_name) —
-- the same normalisation BlogRepository applies on every write — so a byline
-- typed with a stray space links to the same person. A blank byline links to
-- nothing (author_id stays NULL, the storefront shows the name alone).
-- Role and bio are left NULL: they were never stored anywhere but a storefront
-- placeholder, and inventing them here would put fiction under a real name.
-- Idempotent: ON CONFLICT skips existing names, the UPDATE only fills NULLs.
INSERT INTO "authors" ("id", "name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, d."name", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT btrim("author_name") AS "name"
  FROM "blog_posts"
  WHERE btrim("author_name") <> ''
) d
ON CONFLICT ("name") DO NOTHING;

UPDATE "blog_posts" p
SET "author_id" = a."id"
FROM "authors" a
WHERE a."name" = btrim(p."author_name")
  AND p."author_id" IS NULL;
