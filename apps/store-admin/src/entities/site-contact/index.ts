// Site-contact entity — domain type, read hook, and mutation hook.
// Re-exports the Orval-generated site-contact client from the shared layer so
// the rest of the app depends on `@/entities/site-contact` rather than reaching
// into `@/shared/api` directly.

export {
  useSiteContactControllerGetSettings,
  useAdminSiteContactControllerUpdate,
  getSiteContactControllerGetSettingsQueryKey,
} from "@/shared/api";

export type {
  SiteContactSettingsEntity,
  UpdateSiteContactDto,
} from "@/shared/api";
