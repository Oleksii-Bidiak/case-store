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
} from "@/shared/api/generated/returns/returns";

export type {
  ReturnEntity,
  ReturnItemEntity,
  CreateReturnDto,
  ReturnItemDto,
  ReturnResponseEnvelope,
  ReturnListResponseEnvelope,
} from "@/shared/api/generated/models";
