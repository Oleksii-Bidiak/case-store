-- TASK-1959: «Мої пристрої» in the account.
--
-- WHAT  user_devices (one row per user x device model, label + lastUsedAt; the active
--       device is the latest lastUsedAt) and user_device_settings (the catalogue
--       filter defaults; whether the row exists decides the guest -> account merge).
-- WHY   a signed-in customer's devices follow them across browsers; the guest list
--       stays in localStorage and the storefront pushes it in on sign-in.
-- SAFE  additive only: two new tables and an enum, no existing row is touched.

-- CreateEnum
CREATE TYPE "DeviceCompatScope" AS ENUM ('active', 'all');

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_model_id" TEXT NOT NULL,
    "label" VARCHAR(30),
    "last_used_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_device_settings" (
    "user_id" TEXT NOT NULL,
    "compat_only" BOOLEAN NOT NULL DEFAULT true,
    "compat_scope" "DeviceCompatScope" NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_device_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_user_id_device_model_id_key" ON "user_devices"("user_id", "device_model_id");

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "device_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_device_settings" ADD CONSTRAINT "user_device_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
