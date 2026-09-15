// Staff entity — service accounts, their permissions, and the templates that
// seed them (TASK-480, plan 181).
//
// Carved out of `@/entities/user` rather than added to it. The two surfaces stop
// at different doors and are gated by different keys: customers are
// `customers:read` / `customers:card` and live on `/users`; service accounts are
// `staff:read` / `staff:write` — keys nobody can be GRANTED — and live on
// `/staff`. Keeping the hooks together would have re-created the very confusion
// the split exists to end, where deactivating an administrator was a
// `customers:write` action.
//
// Generated hooks are re-exported here so nothing above this layer imports from
// `shared/api/generated/**`.

export {
  // «Персонал» — the register itself.
  useListStaff,
  useCreateStaff,
  useGetStaff,
  useDeleteStaff,
  useUpdateStaffRole,
  useUpdateStaffStatus,
  useSetStaffPassword,
  useTransferStaffOwnership,
  getListStaffQueryKey,
  getGetStaffQueryKey,
  // Per-person permissions: the granted keys AND the grantable catalogue in one
  // response (see `staff.controller.ts` for why they travel together).
  useGetStaffPermissions,
  useUpdateStaffPermissions,
  getGetStaffPermissionsQueryKey,
  // Permission templates — sets that are COPIED onto a person, never linked.
  useListPermissionTemplates,
  useCreatePermissionTemplate,
  useUpdatePermissionTemplate,
  useDeletePermissionTemplate,
  useApplyPermissionTemplate,
  getListPermissionTemplatesQueryKey,
  getGetPermissionTemplateQueryKey,
  // Value objects for the role/level selects.
  CreateStaffDtoRole,
  UpdateStaffRoleDtoRole,
  ListStaffRole,
} from "@/shared/api";

export type {
  StaffUserEntity,
  StaffListResponseEnvelope,
  StaffResponseEnvelope,
  StaffPermissionsEntity,
  ListStaffParams,
  CreateStaffDto,
  SetStaffPasswordDto,
  UpdateStaffRoleDto,
  UpdateStaffStatusDto,
  UpdateStaffPermissionsDto,
  TransferOwnershipDto,
  OwnershipTransferEntity,
  PermissionTemplateEntity,
  CreatePermissionTemplateDto,
  UpdatePermissionTemplateDto,
  GrantablePermissionEntry,
  PermissionZoneEntry,
} from "@/shared/api";

export {
  ACCESS_LEVEL,
  actorLevel,
  holdsEverythingByLevel,
  levelBadgeVariant,
  levelLabel,
  staffDisplayName,
  type AccessLevel,
} from "./model/access-level";

export {
  groupByZone,
  matchingTemplate,
  samePermissionSet,
  type ZoneGroup,
} from "./model/permission-zones";

export {
  useGrantableCatalogue,
  type GrantableCatalogue,
} from "./model/use-grantable-catalogue";

export { PermissionZoneGrid } from "./ui/PermissionZoneGrid";
