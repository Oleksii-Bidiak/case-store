// Widgets — Composite UI blocks (HeroBanner, CategoryNav, PopularRail, …)
export { Footer } from "./footer";
export { HeroBanner, TrustStrip } from "./hero-banner";
export { CategoryNav, CategoryNavSkeleton } from "./category-nav";
export { CategoriesView } from "./categories";
export { InfoView } from "./info-support";
export { NotFoundView } from "./not-found";
export { PromoView } from "./promo";
export { ContactView } from "./contact";
export {
  PopularRail,
  PopularRailSkeleton,
  firstQueryTabParams,
} from "./product-grid";
export { PromoBanner } from "./promo-banner";
export { Newsletter } from "./newsletter";
export { RecentlyViewed } from "./recently-viewed";
export { BlogView, BlogArticleView } from "./blog";
export { ProductListView, ProductListSkeleton } from "./product-list";
export { SubcategoryChips } from "./category-detail";
export { SearchResultsView, SearchResultsSkeleton } from "./search-results";
export { ProductDetailView, ProductDetailSkeleton } from "./product-detail";
export { ProductReviewsWidget } from "./product-reviews";
export { CartView, CartSkeleton, CartSheet } from "./cart";
export { WishlistView, WishlistSkeleton } from "./wishlist";
export {
  CheckoutView,
  CheckoutOrderSummary,
  CheckoutStepIndicator,
} from "./checkout";
export {
  OrderConfirmationView,
  OrderConfirmationSkeleton,
  GuestOrderView,
} from "./order-confirmation";
export { AccountView, AccountShell, AccountProfileSkeleton } from "./account";
export { OrderHistoryView, OrderHistorySkeleton } from "./order-history";
// TASK-483: the public "number + phone" form — the way back to an order that
// does not depend on still having the confirmation email.
export { OrderLookupView } from "./order-lookup";
export { ProductQuickViewTrigger } from "./product-quick-view";
export { RecommendationCarousels } from "./recommendation-carousels";
// TASK-828: the slices below were public (the routes import them) but missing
// here, so the root barrel described half the layer.
export { Header, HeaderAuth } from "./header";
export { LegalDocView, LegalHubView } from "./legal-doc";
export { ProductCardActions } from "./product-card-actions";
