-- TASK-1956: a category may carry an icon — a key into the storefront SVG sprite
-- (`store-client/public/icons/categories.svg`, style «Дуотон»), validated against
-- CATEGORY_ICON_KEYS in `src/category/category-icons.ts`. A plain nullable TEXT, not a
-- Postgres enum, on purpose: adding an icon is a code change (draw it, add it to the
-- sprite and the allow-list) and needs no migration. NULL — every existing row after
-- this migration — renders the generic «folder» glyph, so the column is additive and
-- changes nothing a shopper sees until an admin (or the seed) picks an icon.
ALTER TABLE "categories" ADD COLUMN     "icon" TEXT;
