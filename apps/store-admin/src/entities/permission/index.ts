// Permission entity — what this session may do (TASK-334 / TASK-475).
//
// The role-matrix hooks (`usePermissionControllerGetMatrix`,
// `usePermissionControllerUpdateGrants`) were re-exported here until TASK-475
// deleted `/api/admin/permissions` along with the matrix itself. Rights belong to
// a person now; the per-person client arrives with /staff (TASK-480).

export type { EffectivePermissionsEntity } from "@/shared/api";

export { PERM, type PermissionKey } from "./model/permission-keys";
export { PERMISSIONS_WITHOUT_ROUTES } from "./model/permissions-without-routes";
