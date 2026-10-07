// Widgets — Composite UI blocks (e.g., AdminSidebar, AdminHeader, DataTable)
export { AdminSidebar, AdminHeader } from "./admin-shell";
export { AdminProductTable, AdminProductTableSkeleton } from "./product-list";
export { CreateProductView, EditProductView } from "./product-form-view";
export {
  AdminProductPreviewSkeleton,
  AdminProductPreviewView,
} from "./admin-product-preview";
export {
  AdminProductGroupTable,
  AdminProductGroupTableSkeleton,
} from "./product-group-list";
export {
  CreateProductGroupView,
  EditProductGroupView,
  ProductGroupFormSkeleton,
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
  DeviceSectionHeader,
  DeviceSectionHeaderSkeleton,
} from "./device-section";
export {
  CreateDeviceModelView,
  DeviceModelFormSkeleton,
  EditDeviceModelView,
} from "./device-model-form-view";
export {
  AdminDiscountTable,
  AdminDiscountTableSkeleton,
} from "./discount-list";
export {
  CreateDiscountView,
  DiscountFormSkeleton,
  EditDiscountView,
} from "./discount-form-view";
export { AdminPageTable, AdminPageTableSkeleton } from "./page-list";
export { CreatePageView, EditPageView } from "./page-form-view";
export {
  BlogPostTable,
  BlogPostTableSkeleton,
  BlogSectionTabs,
} from "./blog-post-list";
export { CreateBlogPostView, EditBlogPostView } from "./blog-post-form-view";
export {
  BlogCategoryTable,
  BlogCategoryTableSkeleton,
} from "./blog-category-list";
export { BlogCategoryFormDialog } from "./blog-category-form-view";
export { AdminBannerTable, AdminBannerTableSkeleton } from "./banner-list";
export {
  BannerFormSkeleton,
  CreateBannerView,
  EditBannerView,
} from "./banner-form-view";
export { AdminBrandTable, AdminBrandTableSkeleton } from "./brand-list";
export {
  AddonServiceTable,
  AddonServiceTableSkeleton,
} from "./addon-service-list";
export {
  BrandFormSkeleton,
  CreateBrandView,
  EditBrandView,
} from "./brand-form-view";
export { SiteContactSettingsView } from "./site-contact-settings-view";
export { SeoSettingsView } from "./seo-settings-view";
export { AdminFaqTable, AdminFaqTableSkeleton } from "./faq-list";
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
// TASK-318 / TASK-317 / TASK-480 — RBAC surfaces. The role-matrix screen was
// deleted in TASK-475 along with the API behind it; the per-person replacement
// is the «Персонал» section below.
export { StaffTable, StaffTableSkeleton, FullAccessPanel } from "./staff-list";
export { StaffDetailView, StaffDetailSkeleton } from "./staff-detail";
export {
  PermissionTemplatesView,
  PermissionTemplatesSkeleton,
} from "./permission-template-list";
export { AuditLogView, AuditLogSkeleton } from "./audit-log";
export { AdminProfileView } from "./admin-profile";
export {
  AdminDashboardStats,
  AdminDashboardStatsError,
  AdminDashboardStatsSkeleton,
  DashboardSectionSkeleton,
} from "./dashboard-stats";
export {
  NeedsActionWidget,
  NeedsActionWidgetSkeleton,
} from "./dashboard-needs-action";
export {
  DashboardCharts,
  DashboardChartsSkeleton,
  RevenueTrendChart,
  OrdersByStatusChart,
} from "./dashboard-charts";
export { DashboardLowStockTable } from "./dashboard-low-stock";
export { ContentMapView } from "./content-map";
export { DashboardTopProductsTable } from "./dashboard-top-products";
export {
  DashboardLastOrdersTable,
  DashboardLastOrdersTableSkeleton,
} from "./dashboard-last-orders";
export { DashboardTrafficCard } from "./dashboard-traffic";
// TASK-692 — /analytics: five reports over one period.
export { AnalyticsView, AnalyticsSkeleton } from "./analytics-reports";
export {
  AdminCarouselTable,
  AdminCarouselTableSkeleton,
} from "./carousel-list";
export {
  CarouselFormSkeleton,
  CreateCarouselView,
  EditCarouselView,
} from "./carousel-form-view";
// Operator-created (phone) orders (TASK-341)
export { OrderCreateView } from "./order-create-view";
// Returns / RMA (TASK-340)
export { AdminReturnTable, AdminReturnTableSkeleton } from "./return-list";
export { ReturnDetailView, ReturnDetailSkeleton } from "./return-detail";
// Supplier-catalogue import (TASK-360)
export { CatalogImportView } from "./catalog-import-view";
// Search-index maintenance (TASK-377)
export { SearchIndexView } from "./search-index-view";
// Delivery methods, courier price, NP dispatch origin (TASK-644)
export {
  DeliverySettingsView,
  DeliverySettingsPageSkeleton,
} from "./delivery-settings-view";
// The shop's Telegram notifications: bot state, connected chats (TASK-676)
export {
  NotificationSettingsView,
  NotificationSettingsPageSkeleton,
} from "./notification-settings-view";
// Internal media library (TASK-441)
export { MediaLibraryView, MediaLibrarySkeleton } from "./media-library-view";
