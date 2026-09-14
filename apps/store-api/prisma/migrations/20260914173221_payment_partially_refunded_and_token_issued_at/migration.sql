-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "access_token_issued_at" TIMESTAMP(3);
