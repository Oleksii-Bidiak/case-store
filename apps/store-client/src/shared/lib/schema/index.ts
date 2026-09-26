// Schema.org JSON-LD builders — pure, safe for client components.
export { buildOrganizationSchema } from "./buildOrganizationSchema";
export { buildWebSiteSchema } from "./buildWebSiteSchema";
export { buildBreadcrumbSchema } from "./buildBreadcrumbSchema";
export type { BreadcrumbItem } from "./buildBreadcrumbSchema";
export { buildProductSchema } from "./buildProductSchema";
export type { BuildProductSchemaInput } from "./buildProductSchema";
export { buildBlogPostingSchema } from "./buildBlogPostingSchema";
export type { BuildBlogPostingSchemaInput } from "./buildBlogPostingSchema";
export { buildFaqPageSchema } from "./buildFaqPageSchema";
export type { FaqSchemaItem } from "./buildFaqPageSchema";
export { buildItemListSchema } from "./buildItemListSchema";
export type { ItemListEntry, ItemListItemType } from "./buildItemListSchema";
// A page of products as an ItemList — the listing routes' shared shape (TASK-563).
export { buildProductItemListSchema } from "./buildProductItemListSchema";
export type { ItemListProduct } from "./buildProductItemListSchema";
// The server-only fetchers (sitemap, merchant feed) live in `./server` — see
// the note there (TASK-819). Nothing below this barrel may perform a request.
