// Widgets — Composite UI blocks (e.g., AdminSidebar, AdminHeader, DataTable)
export { AdminSidebar, AdminHeader } from "./admin-shell";
export { AdminProductTable, AdminProductTableSkeleton } from "./product-list";
export { CreateProductView, EditProductView } from "./product-form-view";
export { AdminProductPreviewView } from "./admin-product-preview";
export {
  AdminProductGroupTable,
  AdminProductGroupTableSkeleton,
} from "./product-group-list";
export {
  CreateProductGroupView,
  EditProductGroupView,
} from "./product-group-form-view";
// TASK-291: `category-list` (the flat AdminCategoryTable) is deleted — the
// treegrid below is the only category list surface.
export { AdminCategoryTree, AdminCategoryTreeSkeleton } from "./category-tree";
export { CreateCategoryView, EditCategoryView } from "./category-form-view";
export {
  DeviceBrandTable,
  DeviceBrandTableSkeleton,
} from "./device-brand-list";
export {
  DeviceModelTable,
  DeviceModelTableSkeleton,
} from "./device-model-list";
export {
  CreateDeviceBrandView,
  EditDeviceBrandView,
} from "./device-brand-form-view";
export {
  CreateDeviceModelView,
  EditDeviceModelView,
} from "./device-model-form-view";
export {
  AdminDiscountTable,
  AdminDiscountTableSkeleton,
} from "./discount-list";
export { CreateDiscountView, EditDiscountView } from "./discount-form-view";
export { AdminPageTable, AdminPageTableSkeleton } from "./page-list";
export { CreatePageView, EditPageView } from "./page-form-view";
export { BlogPostTable, BlogPostTableSkeleton } from "./blog-post-list";
export { CreateBlogPostView, EditBlogPostView } from "./blog-post-form-view";
export {
  BlogCategoryTable,
  BlogCategoryTableSkeleton,
} from "./blog-category-list";
export {
  CreateBlogCategoryView,
  EditBlogCategoryView,
} from "./blog-category-form-view";
export { AdminBannerTable, AdminBannerTableSkeleton } from "./banner-list";
export { CreateBannerView, EditBannerView } from "./banner-form-view";
export { AdminBrandTable, AdminBrandTableSkeleton } from "./brand-list";
export {
  AddonServiceTable,
  AddonServiceTableSkeleton,
} from "./addon-service-list";
export {
  CreateAddonServiceView,
  EditAddonServiceView,
} from "./addon-service-form-view";
export { CreateBrandView, EditBrandView } from "./brand-form-view";
export { SiteContactSettingsView } from "./site-contact-settings-view";
export { SeoSettingsView } from "./seo-settings-view";
export { AdminFaqTable, AdminFaqTableSkeleton } from "./faq-list";
export { CreateFaqView, EditFaqView } from "./faq-form-view";
export { AdminOrderTable, AdminOrderTableSkeleton } from "./order-list";
export {
  AdminReviewTable,
  AdminReviewTableSkeleton,
} from "./review-moderation";
export { MessageInbox, MessageInboxSkeleton } from "./message-inbox";
export { OrderDetailView, OrderDetailSkeleton } from "./order-detail";
export { AdminUserTable, AdminUserTableSkeleton } from "./user-list";
export {
  AdminSubscriberTable,
  AdminSubscriberTableSkeleton,
} from "./subscriber-list";
export { UserDetailView, UserDetailSkeleton } from "./user-detail";
// TASK-334 / TASK-318 / TASK-317 — RBAC surfaces.
export {
  PermissionMatrixView,
  PermissionMatrixSkeleton,
} from "./permission-matrix";
export { AuditLogView, AuditLogSkeleton } from "./audit-log";
export { AdminProfileView } from "./admin-profile";
export {
  AdminDashboardStats,
  AdminDashboardStatsSkeleton,
  DashboardSectionSkeleton,
} from "./dashboard-stats";
export {
  NeedsActionWidget,
  NeedsActionWidgetSkeleton,
} from "./dashboard-needs-action";
export {
  DashboardCharts,
  RevenueTrendChart,
  OrdersByStatusChart,
} from "./dashboard-charts";
export { DashboardLowStockTable } from "./dashboard-low-stock";
export { ContentMapView } from "./content-map";
export { DashboardTopProductsTable } from "./dashboard-top-products";
export { DashboardLastOrdersTable } from "./dashboard-last-orders";
export { DashboardTrafficCard } from "./dashboard-traffic";
export {
  AdminCarouselTable,
  AdminCarouselTableSkeleton,
} from "./carousel-list";
export { CreateCarouselView, EditCarouselView } from "./carousel-form-view";
// Operator-created (phone) orders (TASK-341)
export { OrderCreateView } from "./order-create-view";
// Returns / RMA (TASK-340)
export { AdminReturnTable, AdminReturnTableSkeleton } from "./return-list";
export { ReturnDetailView, ReturnDetailSkeleton } from "./return-detail";
// Supplier-catalogue import (TASK-360)
export { CatalogImportView } from "./catalog-import-view";
// Search-index maintenance (TASK-377)
export { SearchIndexView } from "./search-index-view";
