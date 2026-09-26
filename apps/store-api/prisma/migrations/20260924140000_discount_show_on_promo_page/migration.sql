-- TASK-731 (рішення B-11): «Показувати на сторінці «Акції»».
-- A new code is private until the operator publishes it (column default false),
-- but every code that exists today was ALREADY public — the storefront page
-- listed every active code in its window. Backfill them to true so the page
-- does not empty out on deploy.

-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "show_on_promo_page" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every pre-existing code keeps being published.
UPDATE "discounts" SET "show_on_promo_page" = true;
