// Search-index entity (TASK-377) — the admin-side maintenance surface of the
// product search index.
//
// Re-exports the Orval-generated search client from the shared layer so widgets
// depend on `@/entities/search` rather than reaching into `@/shared/api`.
// Querying itself is the storefront's job; the admin only ever REBUILDS the
// index, which is why the single export here is a mutation.

export { useReindexSearch } from "@/shared/api";

export type { ReindexResponseEnvelope } from "@/shared/api";
