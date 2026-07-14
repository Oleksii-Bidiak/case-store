-- CreateTable
CREATE TABLE "site_contact_settings" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "working_hours" TEXT,
    "viber_link" TEXT,
    "telegram_link" TEXT,
    "instagram_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_contact_settings_pkey" PRIMARY KEY ("id")
);
