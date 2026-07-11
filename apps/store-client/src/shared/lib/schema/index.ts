// Schema.org JSON-LD builders (pure) + server-only product paginator for SEO.
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
export type { ItemListEntry } from "./buildItemListSchema";
export { fetchAllActiveProducts } from "./fetchAllProducts";
export { fetchAllPublishedPages } from "./fetchAllPages";
export {
  fetchAllActiveCategories,
  flattenActiveCategories,
} from "./fetchAllCategories";
export type { FlatCategoryRoute } from "./fetchAllCategories";
