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
  // TASK-469 — the admin door onto a return, hung off the ORDER path. The read
  // answers "is there a return on this order yet?", which is the question the
  // REFUNDED dialog asks before offering to create one; the customer-facing twin
  // cannot answer it for an operator, being scoped to the caller's own orders.
  useAdminOrderReturnControllerFindForOrder,
  useAdminOrderReturnControllerCreate,
  getAdminOrderReturnControllerFindForOrderQueryKey,
  // Status enum value object (filters, badge mapping, the resolve picker).
  ReturnEntityStatus,
} from "@/shared/api";

export type {
  ReturnEntity,
  ReturnItemEntity,
  ResolveReturnDto,
  CreateReturnDto,
  ReturnItemDto,
  AdminReturnControllerFindAllParams,
  AdminReturnListResponse,
  AdminReturnResponseEnvelope,
} from "@/shared/api";

export { returnStatusLabel } from "./status-label";
export { returnStatusBadgeVariant } from "./status-badge";
export { allowedReturnTransitions, RESTOCK_ON_STATUS } from "./transitions";
