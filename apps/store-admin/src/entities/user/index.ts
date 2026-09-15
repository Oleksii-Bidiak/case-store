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
  // `useDeleteUser` targets `DELETE /api/users/:id`, which stayed owner-only AND
  // customer-only when the staff doors widened in TASK-476 — deleting a shopper
  // erases a person's record, and nothing in plan 181 asked for that to be
  // delegated.
  //
  // The staff hooks that used to be re-exported here (`useCreateStaff`,
  // `useSetStaffPassword`, `useUpdateStaffRole`, `getListStaffQueryKey`,
  // `CreateStaffDtoRole`, `UpdateStaffRoleDtoRole`) moved to `@/entities/staff`
  // in TASK-480, along with the rest of the register. They were parked here only
  // until the `/staff` section existed to own them.
  useDeleteUser,
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
