-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('LEGAL', 'INFO', 'HUB');

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "kind" "PageKind" NOT NULL DEFAULT 'LEGAL';

-- CreateIndex
CREATE INDEX "pages_kind_idx" ON "pages"("kind");
