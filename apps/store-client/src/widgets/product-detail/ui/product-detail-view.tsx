"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";
import { useProductControllerFindBySlug } from "@/entities/product";
import { pushRecentlyViewed } from "@/widgets/recently-viewed";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { RatingStars } from "@/shared/ui";
import { ProductDetailSkeleton } from "./product-detail-skeleton";
import { ProductImageGallery } from "./product-image-gallery";
import { ProductSiblingNavigator } from "./product-sibling-navigator";
import { ProductStockIndicator } from "./product-stock-indicator";
import { ProductTrustBadges } from "./product-trust-badges";
import { ProductSpecsTabs } from "./product-specs-tabs";
import { ProductRelated } from "./product-related";
import { MobileAtcBar } from "./mobile-atc-bar";

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * ProductDetailView — client orchestrator for the product detail page (redesign
 * from the Product.dc.html import). Fetches the position by slug and composes
 * the breadcrumb, a three-column hero (gallery / info / sticky buy box), the
 * detail tabs and a related rail. Each position is a first-class product, so
 * price/stock/sku read directly from the position row; switching an attribute
 * navigates to a sibling position's slug (TASK-142).
 */
export function ProductDetailView({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useProductControllerFindBySlug(slug);

  const sortedImages = useMemo(
    () => [...(data?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewed?.id]);

  if (isLoading) {
    return <ProductDetailSkeleton />;
  }

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
    <article className="flex flex-col gap-10 pb-24 md:pb-0">
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
              href={`/products?categoryId=${category.id}`}
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

      {/* Hero: gallery + info + sticky buy box. */}
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_1fr_360px] lg:items-start">
        {/* Gallery with sale badge + wishlist overlay. */}
        <div className="relative">
          <ProductImageGallery
            images={sortedImages}
            altFallback={product.name}
          />
          {onSale && (
            <span className="absolute top-4 left-4 rounded-[9px] bg-sale px-3 py-1.5 text-sm font-bold text-sale-foreground">
              −{discountPercent}%
            </span>
          )}
          <div className="absolute top-4 right-4">
            <WishlistToggleButton
              productId={product.id}
              productName={product.name}
              variant="overlay"
              className="size-10"
            />
          </div>
        </div>

        {/* Info column. */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            {product.brand && (
              <Link
                href={`/products?brandId=${product.brand.id}`}
                className="text-sm font-semibold text-primary no-underline transition-colors hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {product.brand.name}
              </Link>
            )}
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[27px] sm:leading-tight">
              {product.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
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

          {group && (
            <ProductSiblingNavigator
              group={group}
              currentAttributes={product.attributes}
              currentSlug={product.slug}
            />
          )}
        </div>

        {/* Sticky buy box. */}
        <div className="lg:sticky lg:top-20">
          <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-[var(--shadow-card)]">
            <div className="mb-1 flex flex-wrap items-end gap-3">
              <span
                className={`font-display text-[32px] font-bold tracking-tight ${
                  onSale ? "text-sale" : "text-foreground"
                }`}
              >
                {formatMoney(product.price)}
              </span>
              {onSale && product.compareAtPrice && (
                <span className="pb-1.5 font-mono text-[17px] text-muted-foreground line-through">
                  {formatMoney(product.compareAtPrice)}
                </span>
              )}
            </div>

            <div className="mb-4">
              <ProductStockIndicator
                inStock={product.inStock}
                lowStock={product.lowStock}
              />
            </div>

            <div className="mb-2.5 flex items-stretch gap-2.5">
              <div className="flex-1">
                <AddToCartButton
                  productId={product.id}
                  disabled={!product.inStock}
                />
              </div>
              {/* Compare — parked feature (TASK-085); stubbed as a toast. */}
              <button
                type="button"
                onClick={() => toast(dict.product.compareStub)}
                aria-label={dict.product.compareAria}
                className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <BarChart3 className="size-[19px]" aria-hidden="true" />
              </button>
            </div>

            {/* Express order — no backend yet (TASK-178); stubbed as a toast. */}
            <button
              type="button"
              onClick={() => toast(dict.product.oneClickStub)}
              disabled={!product.inStock}
              className="h-12 w-full cursor-pointer rounded-lg border border-border bg-background text-[15px] font-semibold text-foreground transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dict.product.buyOneClick}
            </button>

            <ProductTrustBadges />
          </div>
        </div>
      </div>

      <ProductSpecsTabs
        description={product.description ?? null}
        productId={product.id}
      />

      <ProductRelated categoryId={category.id} excludeId={product.id} />

      <MobileAtcBar
        productId={product.id}
        price={product.price}
        disabled={!product.inStock}
      />
    </article>
  );
}
