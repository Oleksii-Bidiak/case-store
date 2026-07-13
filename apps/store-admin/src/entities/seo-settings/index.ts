// SEO-settings entity — domain type, read hook, and mutation hook.
// Re-exports the Orval-generated seo-settings client from the shared layer so
// the rest of the app depends on `@/entities/seo-settings` rather than reaching
// into `@/shared/api` directly.

export {
  useSeoSettingsControllerGetSettings,
  useAdminSeoSettingsControllerUpdate,
  useAdminSeoSettingsControllerGetHealth,
  // Store-logo upload/delete (TASK-299). The operationIds come from
  // `AdminSeoSettingsController`, hence the `useAdminSeoSettings…` prefix —
  // there is no `useSeoSettingsControllerUploadLogo`.
  useAdminSeoSettingsControllerUploadLogo,
  useAdminSeoSettingsControllerDeleteLogo,
  getSeoSettingsControllerGetSettingsQueryKey,
} from "@/shared/api";

export type {
  SeoSettingsEntity,
  UpdateSeoSettingsDto,
  SeoHealthEntity,
} from "@/shared/api";
