-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "created_by_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
