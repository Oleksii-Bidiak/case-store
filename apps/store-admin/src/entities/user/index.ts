// User entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated users client from the shared layer so the rest
// of the app depends on `@/entities/user` rather than reaching into
// `@/shared/api` directly.

export {
  useUserControllerFindAll,
  useUserControllerFindById,
  useUserControllerDeactivateUser,
  useUserControllerActivateUser,
  getUserControllerFindAllQueryKey,
  getUserControllerFindByIdQueryKey,
  // Enriched admin customer card (TASK-252).
  useGetUserAdminCard,
  getGetUserAdminCardQueryKey,
  // Staff management (TASK-317 / TASK-333, moved to `/api/admin/staff` in
  // TASK-476). The three mutations are `staff:write` now rather than owner-only:
  // a deputy admin may hire and rescue a MANAGER, and the level rule refuses them
  // on another admin or on the owner. `useDeleteUser` still targets
  // `DELETE /api/users/:id`, which stayed owner-only and CUSTOMER-only.
  //
  // These live under `@/entities/user` until TASK-480 builds the `/staff`
  // section and gives them an entity of their own; moving them now would be a
  // second refactor of the same imports.
  useCreateStaff,
  useSetStaffPassword,
  useUpdateStaffRole,
  getListStaffQueryKey,
  useDeleteUser,
  CreateStaffDtoRole,
  UpdateStaffRoleDtoRole,
  // Role value object (used for filters and badge mapping).
  UserEntityRole,
  // Customer-notes journal (TASK-430) — staff-only, append-only. There is no
  // update and no delete hook to re-export, because the API offers neither.
  useListUserNotes,
  getListUserNotesQueryKey,
  useCreateUserNote,
} from "@/shared/api";

export type {
  UserEntity,
  UserListResponseEnvelope,
  UserResponseEnvelope,
  UserControllerFindAllParams,
  CreateStaffDto,
  SetStaffPasswordDto,
  UpdateStaffRoleDto,
  // Enriched admin customer card types (TASK-252).
  UserAdminCardEntity,
  UserAdminCardResponseEnvelope,
  CustomerCardOrderEntity,
  CustomerCardReviewEntity,
  CustomerCardCouponEntity,
  CustomerCardContactMessageEntity,
  // Customer-notes journal (TASK-430).
  UserNoteEntity,
  UserNoteListResponse,
  CreateUserNoteDto,
} from "@/shared/api";

export { ROLE_VALUES, roleLabel, isStaffRole } from "./model/roles";
