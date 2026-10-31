"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";
import {
  ProductImageGallery,
  ProductStockIndicator,
  useProductControllerFindBySlug,
} from "@/entities/product";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { pushRecentlyViewed } from "@/widgets/recently-viewed";
import { CartSheet } from "@/widgets/cart";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { formatMoney, trackEvent } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { resolveSiteName } from "@/shared/lib/seo";
import {
  dict,
  FEATURE_STUBS,
  H1_CLASS,
  STICKY_ASIDE_TOP,
} from "@/shared/config";
import { Badge, RatingStars } from "@/shared/ui";
import { ProductDetailSkeleton } from "./product-detail-skeleton";
import { ProductSiblingNavigator } from "./product-sibling-navigator";
import { ProductTrustBadges } from "./product-trust-badges";
import { ProductSpecsTabs } from "./product-specs-tabs";
import { ProductHighlights } from "./product-highlights";
import { ProductRail } from "./product-rail";
import { ProductCompatRow } from "./product-compat-row";
import { MobileAtcBar } from "./mobile-atc-bar";
import { ProductInCartButton } from "./product-in-cart-button";
import { usePreselectDeviceVariant } from "../model/use-preselect-device-variant";

/** The buy row's CTA and heart: 56px (Product mockup §6.1). */
const BUY_ROW_HEIGHT = "h-14";

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * ProductDetailView — client orchestrator for the product detail page (redesign
 * from the Product.dc.html import). Fetches the position by slug and composes
 * the breadcrumb, a two-half hero (sticky gallery / one info column that
 * carries the price and the buy row), the detail tabs and two rails. Each position is a first-class product, so
 * price/stock/sku read directly from the position row; switching an attribute
 * navigates to a sibling position's slug (TASK-142).
 */
export function ProductDetailView({
  slug,
  preview = false,
  siteName = resolveSiteName(),
}: {
  slug: string;
  /**
   * The admin-managed store name (`resolveSiteName(seo)` on the page,
   * TASK-1639), named by the buy box's warranty row. Omitted → the default.
   */
  siteName?: string;
  /**
   * The page is a signed preview (TASK-669). The product the server seeded may
   * be a draft, and the browser's own read carries no preview token (it lives
   * in an httpOnly cookie), so any background refetch would swap the draft for
   * a 404. In preview the seed is therefore never considered stale.
   */
  preview?: boolean;
}) {
  const { data, isLoading, isError } = useProductControllerFindBySlug(
    slug,
    preview ? { query: { staleTime: Infinity } } : undefined,
  );

  const sortedImages = useMemo(
    () => [...(data?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  );

  // Is THIS position already in the cart? Read from the same cached cart query
  // the header badge and the product cards observe (guest cart included, via the
  // cartToken cookie), held until the auth bootstrap settles so it never
  // reflects a transient empty guest cart minted during refresh (TASK-118).
  // Extra observers of one query key are free. This — not the add mutation's
  // `isSuccess` — is what the buy box renders, so the state survives a reload
  // and clears when the line is removed (TASK-409).
  const { isInitializing } = useAuth();
  const { data: cart } = useGetCart({ query: { enabled: !isInitializing } });
  const productId = data?.data.id;
  const inCart =
    cart?.data?.items?.some((item) => item.productId === productId) ?? false;

  // The mini-cart sheet is mounted lazily on first open — the PDP should not
  // carry an idle sheet for a shopper who never opens one.
  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openCartSheet = () => {
    setSheetMounted(true);
    setSheetOpen(true);
  };

  // Record this product in the guest "recently viewed" history (localStorage),
  // so the homepage "Ви переглядали" rail has something to show. Keyed to the
  // product id so switching between sibling positions re-records correctly.
  // Only the minimal snapshot is stored (TASK-211) — the rail re-fetches fresh
  // cards by id, so prices/images are never rendered from this snapshot.
  const viewed = data?.data;
  useEffect(() => {
    if (!viewed) return;
    pushRecentlyViewed({
      id: viewed.id,
      name: viewed.name,
      slug: viewed.slug,
    });
    // Analytics: report the product view (funnel step 1). Keyed on the same
    // viewed.id, so switching sibling positions re-fires once per position.
    trackEvent("view_product", { slug: viewed.slug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewed?.id]);

  // Rule 7: an active device with a variant of this product opens that
  // variant, once per group (client-only, after the device store hydrates).
  usePreselectDeviceVariant({
    group: data?.group,
    currentAttributes: viewed?.attributes,
    currentSlug: viewed?.slug ?? slug,
    compatibleDeviceModelIds: (viewed?.compatibleDeviceModels ?? []).map(
      (m) => m.id,
    ),
  });

  if (isLoading) {
    return <ProductDetailSkeleton />;
  }

  // An outage, not an absence: a dead slug never reaches this view — the
  // server page answers it with the store's not-found (TASK-874).
  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-destructive">
          {dict.product.loadError}
        </p>
        <Link href="/products" className="text-primary underline">
          {dict.product.backToProducts}
        </Link>
      </div>
    );
  }

  const product = data.data;
  const { category, group } = data;

  const onSale =
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(product.price);
  const discountPercent = onSale
    ? Math.round(
        (1 - Number(product.price) / Number(product.compareAtPrice)) * 100,
      )
    : 0;

  return (
    <article className="flex flex-col gap-10 pb-30 lg:pb-0">
      <nav aria-label={dict.product.breadcrumbAria}>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-primary">
              {dict.product.breadcrumbHome}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link href="/products" className="hover:text-primary">
              {dict.product.breadcrumbProducts}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link
              href={`/categories/${category.slug}`}
              className="hover:text-primary"
            >
              {category.name}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="font-medium text-foreground">
            {truncate(product.name, 30)}
          </li>
        </ol>
      </nav>

      {/* Hero (Product mockup §6.1): one column below 1024px — gallery, then
          info — and two EQUAL halves from 1024px (the owner rejected a wider
          gallery), the gallery sticky beside a single info column. Everything
          that sells lives in that one column, in the mockup's order: title →
          compatibility → price + stock → model chips → swatches → buy row →
          services. There is no separate buy box any more. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
        {/* Gallery with the sale badge. The heart moved into the buy row. */}
        <div className={`relative lg:sticky ${STICKY_ASIDE_TOP}`}>
          <ProductImageGallery
            images={sortedImages}
            altFallback={product.name}
          />
          {/* The catalogue's sale badge (shared/ui Badge, `sale` variant —
              TASK-874), at the PDP's size: the larger photo takes the mockup's
              `.pd-sale` chip (badge radius `rounded-sm`), not the card's
              compact pill. */}
          {onSale && (
            <Badge
              variant="sale"
              className="absolute top-4 left-4 rounded-sm px-3 py-1.5 text-sm font-bold"
            >
              −{discountPercent}%
            </Badge>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4.5">
          {/* 1. Brand, title, rating and code. */}
          <div className="flex flex-col gap-1">
            {product.brand && (
              <Link
                href={`/products?brand=${encodeURIComponent(product.brand.slug)}`}
                className="self-start rounded-sm text-sm font-bold text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                {product.brand.name}
              </Link>
            )}
            <h1 className={`${H1_CLASS} text-foreground`}>{product.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <RatingStars
                average={product.ratingAverage}
                count={product.ratingCount}
                size="md"
              />
              {typeof product.sku === "string" && product.sku.length > 0 && (
                <span>
                  {dict.product.codeLabel}{" "}
                  <b className="font-mono text-foreground">{product.sku}</b>
                </span>
              )}
            </div>
          </div>

          {/* 2. «Чи підійде до мого пристрою?» — the store's main question,
              answered under the title and BEFORE the price (TASK-1953).
              Renders nothing without compatibility data. */}
          <ProductCompatRow
            models={product.compatibleDeviceModels}
            group={group}
            currentAttributes={product.attributes}
            currentSlug={product.slug}
            currentPrice={product.price}
          />

          {/* 3. Price + the stock line (§3.4). */}
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={cn(
                  "text-3xl font-bold tracking-tight tabular-nums",
                  onSale ? "text-sale" : "text-foreground",
                )}
              >
                {formatMoney(product.price)}
              </span>
              {onSale && product.compareAtPrice && (
                <span className="text-lg text-muted-foreground tabular-nums line-through">
                  {formatMoney(product.compareAtPrice)}
                </span>
              )}
            </div>
            <ProductStockIndicator inStock={product.inStock} className="mt-2" />
          </div>

          {/* 4–5. Model chips, then the colour swatches. */}
          {group && (
            <ProductSiblingNavigator
              group={group}
              currentAttributes={product.attributes}
              currentSlug={product.slug}
            />
          )}

          {/* 6. The buy row: a 56px CTA pill and a 56px heart. */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-stretch gap-2.5">
              <div className="min-w-0 flex-1">
                {inCart ? (
                  // Already in the cart — the same control as the mobile bar's
                  // (in stock: «В кошику»; sold out while it waited: «Товар
                  // закінчився»). Either way it opens the mini-cart.
                  <ProductInCartButton
                    productName={product.name}
                    inStock={product.inStock}
                    onOpenCart={openCartSheet}
                    className={BUY_ROW_HEIGHT}
                  />
                ) : (
                  // Sold out → the outline «Повідомити про надходження»
                  // (TASK-1066 stub) instead of a grey disabled slab.
                  <AddToCartButton
                    productId={product.id}
                    outOfStock={!product.inStock}
                    className={`${BUY_ROW_HEIGHT} rounded-cta text-base`}
                  />
                )}
              </div>
              <WishlistToggleButton
                productId={product.id}
                productName={product.name}
                variant="inline"
                className="size-14 shrink-0 rounded-cta bg-card"
              />
              {/* Compare — parked feature (TASK-085); stubbed as a toast, and
                  shown only where FEATURE_STUBS opts in (TASK-419). The markup
                  stays put: TASK-085 replaces the handler, not the button. */}
              {FEATURE_STUBS && (
                <button
                  type="button"
                  onClick={() => toast(dict.product.compareStub)}
                  aria-label={dict.product.compareAria}
                  className="grid size-14 shrink-0 place-items-center rounded-cta border border-border bg-card text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BarChart3 className="size-5" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Express order — no backend yet (TASK-178); stubbed as a toast
                and gated by the same flag as the compare control above. */}
            {FEATURE_STUBS && (
              <button
                type="button"
                onClick={() => toast(dict.product.oneClickStub)}
                disabled={!product.inStock}
                className="h-12 w-full rounded-cta border border-border bg-card text-base font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dict.product.buyOneClick}
              </button>
            )}
          </div>

          {/* 7. Services: delivery, warranty, returns. */}
          <ProductTrustBadges siteName={siteName} />

          {/* Key structured-spec highlights (TASK-191); renders nothing when
              the product has no filterable specs. */}
          <ProductHighlights highlights={product.highlights} />
        </div>
      </div>

      <ProductSpecsTabs
        description={product.description ?? null}
        productId={product.id}
        specs={product.specs}
      />

      {product.compatibleDeviceModels?.[0] && (
        <ProductRail
          title={dict.product.compatibleTitle}
          headingId="compatible-heading"
          filter={{ deviceModelId: product.compatibleDeviceModels[0].id }}
          excludeId={product.id}
        />
      )}

      <ProductRail
        title={dict.product.relatedTitle}
        headingId="related-heading"
        filter={{ categoryId: category.id }}
        excludeId={product.id}
      />

      <MobileAtcBar
        productId={product.id}
        productName={product.name}
        price={product.price}
        inStock={product.inStock}
        inCart={inCart}
        onOpenCart={openCartSheet}
        compatibleDeviceModelIds={product.compatibleDeviceModels?.map(
          (m) => m.id,
        )}
      />

      {sheetMounted && (
        <CartSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      )}
    </article>
  );
}
