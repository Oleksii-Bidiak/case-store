// Permission entity — the role/permission matrix (TASK-334).
// Re-exports the Orval-generated permissions client from the shared layer so
// widgets and features depend on `@/entities/permission` rather than reaching
// into `@/shared/api` directly.

export {
  usePermissionControllerGetMatrix,
  usePermissionControllerUpdateGrants,
  getPermissionControllerGetMatrixQueryKey,
} from "@/shared/api";

export type {
  PermissionMatrixEntity,
  PermissionMatrixResponseEnvelope,
  PermissionCatalogueEntry,
  PermissionZoneEntry,
  RoleGrantsEntry,
  UpdateRoleGrantsDto,
  EffectivePermissionsEntity,
} from "@/shared/api";

export { PERM, type PermissionKey } from "./model/permission-keys";
export { PERMISSIONS_WITHOUT_ROUTES } from "./model/permissions-without-routes";
