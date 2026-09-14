/*
  A review's rating and a review's text stop being one flag (TASK-584).

  `reviews.is_active` had to mean two unrelated things at once: "this star rating
  counts toward the product's average" and "this sentence has been read by a
  moderator and may be shown". The owner separated them on 2026-09-10 — a rating
  counts immediately, a text waits — so the single boolean is replaced by
  `rating_visible` (does this rating count) and `text_status`
  (PENDING/APPROVED/REJECTED for the comment alone). `REJECTED` is why this is a
  status and not a second boolean: rejecting a text used to HARD-DELETE the row,
  which threw away the author's rating and silently moved the product's score as a
  side effect of a decision that was never about the score.

  ── The grandfathering decision (explicit, owner's, and load-bearing) ───────────

  Every row that already exists is given `rating_visible = true`, unconditionally.

  The new gate says an account's stars only count once its email is confirmed. The
  seeder never sets `email_verified_at` — none of the ~2 200 seeded reviews across
  178 positions has a confirmed author — so applying that gate retroactively would
  compute an honest and useless answer: zero stars on the entire catalogue,
  overnight, on dev and on production alike. The gate therefore applies to what
  happens NEXT; what is already in the table is trusted as it was trusted
  yesterday. A rating that was counting on 2026-09-13 keeps counting on 2026-09-15.

  `text_status` carries the old flag over honestly instead: `is_active = true`
  becomes APPROVED (a moderator did look at it), everything else stays PENDING (the
  column default), so the six seeded pending reviews stay exactly where they were —
  in the queue.

  `hidden_at` and `created_ip` are new and therefore null everywhere. Null means
  "not hidden" and "address unknown", never "same address as the last row" — an
  abuse signal that read null as a value would flag the whole seeded catalogue as
  one abuser.

  The bare `reviews_product_id_idx` is dropped rather than kept: both replacement
  indexes lead with `product_id`, and Postgres serves a product_id-only lookup from
  a composite's leftmost prefix, so a third index would only cost writes.
*/

-- CreateEnum
CREATE TYPE "ReviewTextStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "rating_visible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "text_status" "ReviewTextStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "hidden_at" TIMESTAMP(3),
ADD COLUMN     "created_ip" TEXT;

-- Backfill: grandfather every existing rating (see the note above).
UPDATE "reviews" SET "rating_visible" = true;

-- Backfill: an approved row was approved TEXT; the rest stay PENDING.
UPDATE "reviews" SET "text_status" = 'APPROVED' WHERE "is_active" = true;

-- DropIndex
DROP INDEX "reviews_is_active_idx";

-- DropIndex
DROP INDEX "reviews_product_id_idx";

-- AlterTable
ALTER TABLE "reviews" DROP COLUMN "is_active";

-- CreateIndex
CREATE INDEX "reviews_product_id_rating_visible_idx" ON "reviews"("product_id", "rating_visible");

-- CreateIndex
CREATE INDEX "reviews_product_id_text_status_idx" ON "reviews"("product_id", "text_status");

-- CreateIndex
CREATE INDEX "reviews_created_ip_created_at_idx" ON "reviews"("created_ip", "created_at");

-- CreateTable
CREATE TABLE "review_replies" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_replies_review_id_key" ON "review_replies"("review_id");

-- AddForeignKey
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
