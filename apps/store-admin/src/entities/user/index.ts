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
  // Role value object (used for filters and badge mapping).
  UserEntityRole,
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
} from "@/shared/api";
