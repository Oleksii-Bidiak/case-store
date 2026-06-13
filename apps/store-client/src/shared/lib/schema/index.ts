// Schema.org JSON-LD builders (pure) + server-only product paginator for SEO.
export { buildOrganizationSchema } from "./buildOrganizationSchema";
export { buildWebSiteSchema } from "./buildWebSiteSchema";
export { buildBreadcrumbSchema } from "./buildBreadcrumbSchema";
export type { BreadcrumbItem } from "./buildBreadcrumbSchema";
export { buildProductSchema } from "./buildProductSchema";
export type { BuildProductSchemaInput } from "./buildProductSchema";
export { fetchAllActiveProducts } from "./fetchAllProducts";
