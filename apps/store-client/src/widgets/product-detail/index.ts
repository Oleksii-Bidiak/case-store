export { ProductDetailView } from "./ui/product-detail-view";
export { ProductDetailSkeleton } from "./ui/product-detail-skeleton";
// The rails' listing query — the PDP route prefetches the rails with it
// (TASK-563), so the server's key and the rail's key are one key.
export {
  buildProductRailParams,
  type ProductRailFilter,
} from "./model/rail-params";
