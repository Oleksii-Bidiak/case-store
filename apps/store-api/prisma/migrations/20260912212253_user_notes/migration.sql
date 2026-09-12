-- CreateTable
CREATE TABLE "user_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "author_id" TEXT,
    "author_email" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_notes_user_id_created_at_idx" ON "user_notes"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
