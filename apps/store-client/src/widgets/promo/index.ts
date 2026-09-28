export { PromoView } from "./ui/promo-view";
// The deal grid's listing query — `/promo` prefetches the «Усі» tab with it on
// the server (TASK-563), under the key the grid reads.
export { buildPromoDealsParams } from "./model/deals-params";
