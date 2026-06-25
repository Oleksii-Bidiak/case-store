"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useProductControllerFindBySlug } from "@/entities/product";
import { AddToCartButton } from "@/features/add-to-cart";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { Badge, RatingStars } from "@/shared/ui";
import { ProductDetailSkeleton } from "./product-detail-skeleton";
import { pickCheapestActiveVariantId } from "./pick-default-variant";
import { ProductImageGallery } from "./product-image-gallery";
import { ProductVariantSelector } from "./product-variant-selector";
import { ProductStockIndicator } from "./product-stock-indicator";
import { ProductTrustBadges } from "./product-trust-badges";
import { ProductSpecsTabs } from "./product-specs-tabs";
import { ProductRelated } from "./product-related";
import { MobileAtcBar } from "./mobile-atc-bar";

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * ProductDetailView — client orchestrator for the product detail page.
 * Fetches the product by slug, manages the selected variant, and composes
 * the breadcrumb, image gallery, variant selector, and info panel.
 */
export function ProductDetailView({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useProductControllerFindBySlug(slug);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );

  const variants = useMemo(() => data?.variants ?? [], [data]);

  // Default to the cheapest active variant so the PDP selection matches the
  // price the product card advertised (base price), instead of the
  // alphabetically-first variant the API returns (TASK-126).
  const defaultVariantId = useMemo(
    () => pickCheapestActiveVariantId(variants),
    [variants],
  );

  const sortedImages = useMemo(
    () => [...(data?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  );

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
  const { category } = data;

  // Until the user picks a variant, fall back to the cheapest active one
  // (computed above) so the price and selection state stay in sync without a
  // state-syncing effect.
  const effectiveVariantId = selectedVariantId ?? defaultVariantId;
  const selectedVariant =
    variants.find((variant) => variant.id === effectiveVariantId) ?? null;

  const displayPrice = selectedVariant?.price ?? product.price;
  const onSale =
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(displayPrice);

  return (
    <article className="flex flex-col gap-8 pb-24 md:pb-0">
      <nav aria-label={dict.product.breadcrumbAria}>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-primary">
              {dict.product.breadcrumbHome}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/products" className="hover:text-primary">
              {dict.product.breadcrumbProducts}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/products?categoryId=${category.id}`}
              className="hover:text-primary"
            >
              {category.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {truncate(product.name, 30)}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-8 md:grid md:grid-cols-2">
        <ProductImageGallery images={sortedImages} altFallback={product.name} />

        <div className="flex flex-col gap-6">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {product.name}
          </h1>

          <RatingStars
            average={product.ratingAverage}
            count={product.ratingCount}
            size="md"
          />

          <div className="flex items-center gap-3">
            <p
              className={`font-display text-3xl font-extrabold tracking-tight ${onSale ? "text-sale" : "text-foreground"}`}
            >
              {formatMoney(displayPrice)}
            </p>
            {onSale && product.compareAtPrice && (
              <>
                <p className="text-base text-muted-foreground line-through">
                  {formatMoney(product.compareAtPrice)}
                </p>
                <Badge variant="sale">{dict.product.saleBadge}</Badge>
              </>
            )}
          </div>

          <ProductStockIndicator stock={selectedVariant?.stock ?? null} />

          {typeof product.sku === "string" && product.sku.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {dict.product.sku} {product.sku}
            </p>
          )}

          <ProductVariantSelector
            variants={variants}
            selectedVariantId={effectiveVariantId}
            onVariantChange={setSelectedVariantId}
            basePrice={product.price}
          />

          <AddToCartButton
            productId={product.id}
            variantId={effectiveVariantId}
            disabled={selectedVariant?.stock === 0}
          />

          <ProductTrustBadges />
        </div>
      </div>

      <ProductSpecsTabs description={product.description ?? null} />

      <ProductRelated categoryId={category.id} excludeId={product.id} />

      <MobileAtcBar
        productId={product.id}
        variantId={effectiveVariantId}
        price={displayPrice}
        disabled={selectedVariant?.stock === 0}
      />
    </article>
  );
}
