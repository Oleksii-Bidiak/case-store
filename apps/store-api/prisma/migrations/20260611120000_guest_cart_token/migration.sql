-- AlterTable: make user_id nullable (guest carts have no user) and add the guest token
ALTER TABLE "carts" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "carts" ADD COLUMN "token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "carts_token_key" ON "carts"("token");

-- CreateIndex
CREATE INDEX "carts_token_idx" ON "carts"("token");
