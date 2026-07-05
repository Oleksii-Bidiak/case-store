// Newsletter entity — domain types, admin API hooks, and query-key getters.
// Re-exports the Orval-generated newsletter client from the shared layer so the
// rest of the admin app depends on `@/entities/newsletter` rather than reaching
// into `@/shared/api` directly.

export {
  useAdminNewsletterControllerFindAll,
  getAdminNewsletterControllerFindAllQueryKey,
  // Raw export fetcher — used to pull the CSV on-demand for a file download.
  adminNewsletterControllerExport,
  // Status value object (used for filters and badge mapping).
  AdminNewsletterControllerFindAllStatus,
} from "@/shared/api";

export type {
  NewsletterSubscriptionEntity,
  AdminNewsletterControllerFindAllParams,
  AdminNewsletterControllerExportParams,
} from "@/shared/api";
