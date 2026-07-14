-- CreateEnum
CREATE TYPE "OrderHistoryChangeType" AS ENUM ('STATUS', 'PAYMENT_STATUS');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HERO_SLIDE', 'PROMO_TILE', 'PROMO_BANNER', 'ANNOUNCEMENT_BAR');

-- CreateEnum
CREATE TYPE "ContactMessageStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "SlugRedirectEntity" AS ENUM ('PAGE', 'BLOG_POST', 'PRODUCT', 'CATEGORY');

-- CreateEnum
CREATE TYPE "AddonDeltaType" AS ENUM ('ADD', 'REMOVE', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "CarouselSource" AS ENUM ('BESTSELLING', 'NEWEST', 'ON_SALE', 'CATEGORY', 'MANUAL');

-- CreateEnum
CREATE TYPE "CarouselPlacement" AS ENUM ('HOME_TABS', 'HOME_RAILS');

-- DropIndex
DROP INDEX "pages_is_active_idx";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "meta_description" TEXT,
ADD COLUMN     "meta_title" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "addons_total" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "scheduled_at" TIMESTAMP(3),
ADD COLUMN     "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand_id" TEXT,
ADD COLUMN     "meta_description" TEXT,
ADD COLUMN     "meta_title" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "change_type" "OrderHistoryChangeType" NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus",
    "from_payment_status" "PaymentStatus",
    "to_payment_status" "PaymentStatus",
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_settings" (
    "id" TEXT NOT NULL,
    "default_meta_title" TEXT,
    "default_meta_description" TEXT,
    "title_template" TEXT,
    "default_og_image" TEXT,
    "logo_url" TEXT,
    "google_site_verification" TEXT,
    "bing_site_verification" TEXT,
    "noindex_site" BOOLEAN NOT NULL DEFAULT false,
    "llms_txt_summary" TEXT,
    "additional_sameas_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "cover_blur_data_url" TEXT,
    "author_name" TEXT NOT NULL,
    "reading_minutes" INTEGER,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "category_id" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "placement" "BannerPlacement" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "image_url" TEXT,
    "image_blur_data_url" TEXT,
    "cta_label" TEXT,
    "cta_href" TEXT,
    "theme" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT,
    "order_ref" TEXT,
    "message" TEXT NOT NULL,
    "status" "ContactMessageStatus" NOT NULL DEFAULT 'NEW',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscriptions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "unsubscribed_at" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "device_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_models" (
    "id" TEXT NOT NULL,
    "device_brand_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "series" TEXT,
    "release_year" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "device_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_device_compat" (
    "product_id" TEXT NOT NULL,
    "device_model_id" TEXT NOT NULL,

    CONSTRAINT "product_device_compat_pkey" PRIMARY KEY ("product_id","device_model_id")
);

-- CreateTable
CREATE TABLE "attribute_definitions" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "AttributeType" NOT NULL DEFAULT 'TEXT',
    "unit" TEXT,
    "options" JSONB,
    "is_filterable" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_number" DECIMAL(12,3),

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slug_redirects" (
    "id" TEXT NOT NULL,
    "entity" "SlugRedirectEntity" NOT NULL,
    "old_slug" TEXT NOT NULL,
    "new_slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addon_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_addon_templates" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "addon_service_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_addon_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_service_deltas" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "addon_service_id" TEXT NOT NULL,
    "type" "AddonDeltaType" NOT NULL,
    "price" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addon_service_deltas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_addons" (
    "id" TEXT NOT NULL,
    "cart_item_id" TEXT NOT NULL,
    "addon_service_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_item_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_addons" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "addon_service_id" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carousels" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" "CarouselSource" NOT NULL,
    "category_id" TEXT,
    "item_limit" INTEGER NOT NULL DEFAULT 12,
    "placement" "CarouselPlacement" NOT NULL DEFAULT 'HOME_RAILS',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carousels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carousel_items" (
    "id" TEXT NOT NULL,
    "carousel_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carousel_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_slug_idx" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_changed_at_idx" ON "order_status_history"("order_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "faq_items_is_active_idx" ON "faq_items"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_idx" ON "blog_posts"("status");

-- CreateIndex
CREATE INDEX "blog_posts_slug_idx" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_category_id_idx" ON "blog_posts"("category_id");

-- CreateIndex
CREATE INDEX "banners_placement_status_idx" ON "banners"("placement", "status");

-- CreateIndex
CREATE INDEX "banners_status_idx" ON "banners"("status");

-- CreateIndex
CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_email_key" ON "newsletter_subscriptions"("email");

-- CreateIndex
CREATE INDEX "newsletter_subscriptions_status_idx" ON "newsletter_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "device_brands_slug_key" ON "device_brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "device_models_slug_key" ON "device_models"("slug");

-- CreateIndex
CREATE INDEX "device_models_device_brand_id_idx" ON "device_models"("device_brand_id");

-- CreateIndex
CREATE INDEX "product_device_compat_device_model_id_idx" ON "product_device_compat"("device_model_id");

-- CreateIndex
CREATE INDEX "attribute_definitions_category_id_sort_order_idx" ON "attribute_definitions"("category_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_definitions_category_id_key_key" ON "attribute_definitions"("category_id", "key");

-- CreateIndex
CREATE INDEX "product_attribute_values_definition_id_value_idx" ON "product_attribute_values"("definition_id", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_values_product_id_definition_id_key" ON "product_attribute_values"("product_id", "definition_id");

-- CreateIndex
CREATE INDEX "slug_redirects_entity_new_slug_idx" ON "slug_redirects"("entity", "new_slug");

-- CreateIndex
CREATE UNIQUE INDEX "slug_redirects_entity_old_slug_key" ON "slug_redirects"("entity", "old_slug");

-- CreateIndex
CREATE INDEX "addon_services_is_active_idx" ON "addon_services"("is_active");

-- CreateIndex
CREATE INDEX "category_addon_templates_category_id_idx" ON "category_addon_templates"("category_id");

-- CreateIndex
CREATE INDEX "category_addon_templates_addon_service_id_idx" ON "category_addon_templates"("addon_service_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_addon_templates_category_id_addon_service_id_key" ON "category_addon_templates"("category_id", "addon_service_id");

-- CreateIndex
CREATE INDEX "addon_service_deltas_product_id_idx" ON "addon_service_deltas"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "addon_service_deltas_product_id_addon_service_id_key" ON "addon_service_deltas"("product_id", "addon_service_id");

-- CreateIndex
CREATE INDEX "cart_item_addons_cart_item_id_idx" ON "cart_item_addons"("cart_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_item_addons_cart_item_id_addon_service_id_key" ON "cart_item_addons"("cart_item_id", "addon_service_id");

-- CreateIndex
CREATE INDEX "order_item_addons_order_item_id_idx" ON "order_item_addons"("order_item_id");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_id_key" ON "oauth_accounts"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "carousels_status_sort_order_idx" ON "carousels"("status", "sort_order");

-- CreateIndex
CREATE INDEX "carousels_placement_status_sort_order_idx" ON "carousels"("placement", "status", "sort_order");

-- CreateIndex
CREATE INDEX "carousels_category_id_idx" ON "carousels"("category_id");

-- CreateIndex
CREATE INDEX "carousel_items_carousel_id_sort_order_idx" ON "carousel_items"("carousel_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "carousel_items_carousel_id_product_id_key" ON "carousel_items"("carousel_id", "product_id");

-- CreateIndex
CREATE INDEX "pages_status_idx" ON "pages"("status");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "blog_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_models" ADD CONSTRAINT "device_models_device_brand_id_fkey" FOREIGN KEY ("device_brand_id") REFERENCES "device_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_device_compat" ADD CONSTRAINT "product_device_compat_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_device_compat" ADD CONSTRAINT "product_device_compat_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "device_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "attribute_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_addon_templates" ADD CONSTRAINT "category_addon_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_addon_templates" ADD CONSTRAINT "category_addon_templates_addon_service_id_fkey" FOREIGN KEY ("addon_service_id") REFERENCES "addon_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_service_deltas" ADD CONSTRAINT "addon_service_deltas_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_service_deltas" ADD CONSTRAINT "addon_service_deltas_addon_service_id_fkey" FOREIGN KEY ("addon_service_id") REFERENCES "addon_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_addons" ADD CONSTRAINT "cart_item_addons_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_addons" ADD CONSTRAINT "cart_item_addons_addon_service_id_fkey" FOREIGN KEY ("addon_service_id") REFERENCES "addon_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_addon_service_id_fkey" FOREIGN KEY ("addon_service_id") REFERENCES "addon_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carousels" ADD CONSTRAINT "carousels_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carousel_items" ADD CONSTRAINT "carousel_items_carousel_id_fkey" FOREIGN KEY ("carousel_id") REFERENCES "carousels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carousel_items" ADD CONSTRAINT "carousel_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
