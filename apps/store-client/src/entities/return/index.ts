// Return (RMA) entity — re-exports the generated customer-facing returns client
// (FSD entities layer). Features import return data access from here, never from
// `@/shared/api/generated` directly.
//
// Its own slice rather than a few more lines on `entities/order`: a return is a
// separate aggregate with its own lifecycle (REQUESTED → APPROVED → RECEIVED →
// REFUNDED, or REJECTED) that outlives the order screen it is opened from, and
// the admin panel has modelled it that way since TASK-340.

export {
  // TASK-373: the endpoint has existed since TASK-340 and the storefront had no
  // way to reach it — there was no button anywhere in the account area.
  useCreateReturn,
  useGetOrderReturns,
  getGetOrderReturnsQueryKey,
  // TASK-608: every return the customer has, so the order history can show a
  // request's status without one request per order.
  useGetMyReturns,
  getGetMyReturnsQueryKey,
  // TASK-1964: the same request dialog on a guest order, keyed by the order's
  // access token instead of an owner.
  useGetGuestOrderReturns,
  getGetGuestOrderReturnsQueryKey,
  useCreateGuestReturn,
} from "@/shared/api/generated/returns/returns";

export { ReturnOutcome } from "@/shared/api/generated/models";

export type {
  ReturnEntity,
  ReturnItemEntity,
  CreateReturnDto,
  ReturnItemDto,
  ReturnResponseEnvelope,
  ReturnListResponseEnvelope,
} from "@/shared/api/generated/models";

// TASK-1962: the return history of one order and the one-badge summary of all
// of an order's requests (the order history used to show only the newest).
export {
  summarizeReturns,
  summarizeReturnsByOrder,
  type ReturnsSummary,
  type ReturnsSummaryTone,
} from "./model/summarize-returns";
export { ReturnHistory } from "./ui/return-history";
export {
  OrderReturnHistory,
  // TASK-1965: the same history on a guest order, by its access token.
  GuestOrderReturnHistory,
} from "./ui/order-return-history";
export { ReturnSummaryBadge } from "./ui/return-summary-badge";
// The guest returns query must not refetch on focus — the endpoint is
// throttled (20/min per IP).
export { guestReturnsQueryOptions } from "./model/guest-returns-query";
