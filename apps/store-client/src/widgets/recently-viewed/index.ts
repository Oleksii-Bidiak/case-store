export { RecentlyViewed } from "./ui/recently-viewed";
// Write side, exposed for the product-detail page to record views (TASK-162).
export {
  pushRecentlyViewed,
  type RecentlyViewedItem,
} from "./model/recently-viewed-storage";
