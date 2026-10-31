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
  // TASK-2044 (B-12 §1.1) — the decision is its own write, with a reason the
  // customer sees, an author and a history.
  useAdminReturnControllerDecide,
  ReturnDecision,
  ReturnOutcome,
  ReturnChannel,
} from "@/shared/api";

export type {
  ReturnEntity,
  ReturnItemEntity,
  ReturnDecisionEventEntity,
  ReturnActorEntity,
  DecideReturnDto,
  ResolveReturnDto,
  CreateReturnDto,
  ReturnItemDto,
  AdminReturnControllerFindAllParams,
  AdminReturnListResponse,
  AdminReturnResponseEnvelope,
} from "@/shared/api";

export { returnStatusLabel } from "./status-label";
export { returnStatusBadgeVariant } from "./status-badge";
export {
  allowedReturnTransitions,
  availableDecisions,
  nextResolveStep,
  RESTOCK_ON_STATUS,
} from "./transitions";
export {
  returnDecisionLabel,
  returnOutcomeLabel,
  returnReasonHeading,
} from "./decision-label";
// TASK-1963 — what is still returnable on an order (REJECTED frees units).
export {
  clampQuantity,
  returnableLines,
  type ExistingReturn,
  type OrderLine,
  type ReturnableLine,
} from "./model/returnable-units";
