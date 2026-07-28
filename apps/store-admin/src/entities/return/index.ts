// Return (RMA) entity — domain types, API hooks and query-key getters (TASK-340).
// Re-exports the Orval-generated admin-returns client from the shared layer so
// the rest of the app depends on `@/entities/return` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminReturnControllerFindAll,
  useAdminReturnControllerFindById,
  useAdminReturnControllerResolve,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  // Status enum value object (filters, badge mapping, the resolve picker).
  ReturnEntityStatus,
} from "@/shared/api";

export type {
  ReturnEntity,
  ReturnItemEntity,
  ResolveReturnDto,
  AdminReturnControllerFindAllParams,
  AdminReturnListResponse,
  AdminReturnResponseEnvelope,
} from "@/shared/api";

export { returnStatusLabel } from "./status-label";
export { returnStatusBadgeVariant } from "./status-badge";
export { allowedReturnTransitions, RESTOCK_ON_STATUS } from "./transitions";
