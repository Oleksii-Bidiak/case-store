"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  ProductImageGallery,
  ProductStockIndicator,
  useProductControllerFindBySlug,
} from "@/entities/product";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  Button,
  ColorDots,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  RatingStars,
} from "@/shared/ui";
import { ProductQuickViewSkeleton } from "./product-quick-view-skeleton";

/**
 * The minimal list-card identity the quick-view needs up front: the name (dialog
 * title + aria) and slug (the by-slug detail fetch + PDP link). Everything else
 * hydrates from the detail response, so any card summary — a full
 * `PublicProductEntity` or the trimmed wishlist item — can open the same preview.
 */
export type QuickViewProductRef = Pick<PublicProductEntity, "name" | "slug">;

interface ProductQuickViewProps {
  /** The list-card entity the trigger was rendered for — supplies name/slug up front. */
  product: QuickViewProductRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ProductQuickView — a preview of a product in a modal (TASK-086): gallery,
 * price, rating, stock, read-only variant colours, and the real add-to-cart /
 * wishlist controls, plus a link out to the full PDP for specs/reviews/variant
 * switching. NOT a PDP replacement — see docs/plans/156.
 *
 * The full image gallery lives only on the detail response, so the whole body is
 * a skeleton until `useProductControllerFindBySlug` resolves; the fetch is gated
 * on `open` so a grid of triggers never fetches until one is actually opened.
 * The dialog title/description come from the list entity we already hold, so the
 * dialog is named for assistive tech the instant it opens.
 *
 * One `Dialog` styled responsively (fullscreen below `sm`, a widened centered
 * card at `sm`+) — a single a11y/animation implementation, no separate `Sheet`
 * path. Radix gives focus-trap, Escape-to-close and return-focus-to-trigger.
 */
export function ProductQuickView({
  product,
  open,
  onOpenChange,
}: ProductQuickViewProps) {
  const { data, isPending, isError, refetch, isFetching } =
    useProductControllerFindBySlug(product.slug, { query: { enabled: open } });

  // Detail response carries the fresher position row; sort images the same way
  // the PDP does (by sortOrder) so the gallery order matches.
  const detail = data?.data;
  const sortedImages = useMemo(
    () => [...(data?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  );

  const onSale =
    detail != null &&
    detail.compareAtPrice != null &&
    Number(detail.compareAtPrice) > Number(detail.price);
  const discountPercent =
    onSale && detail
      ? Math.round(
          (1 - Number(detail.price) / Number(detail.compareAtPrice)) * 100,
        )
      : 0;

  const colors = detail?.variantSummary?.colors ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh gap-4 overflow-y-auto sm:max-w-2xl lg:max-w-3xl max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:w-screen max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl font-bold tracking-tight">
            {product.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {dict.quickView.dialogDescription(product.name)}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <p role="alert" className="text-sm text-destructive">
              {dict.quickView.loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {dict.quickView.retry}
            </Button>
          </div>
        ) : isPending || !detail ? (
          <ProductQuickViewSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="relative">
              <ProductImageGallery
                images={sortedImages}
                altFallback={detail.name}
              />
              {onSale && (
                <span className="absolute top-3 left-3 rounded-md bg-sale px-2.5 py-1 text-xs font-bold text-sale-foreground">
                  −{discountPercent}%
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <RatingStars
                  average={detail.ratingAverage}
                  count={detail.ratingCount}
                  size="md"
                />
                {typeof detail.sku === "string" && detail.sku.length > 0 && (
                  <span>
                    {dict.product.codeLabel}{" "}
                    <b className="font-mono text-foreground">{detail.sku}</b>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-baseline gap-2.5">
                <span
                  className={`font-display text-3xl font-bold tracking-tight ${
                    onSale ? "text-sale" : "text-foreground"
                  }`}
                >
                  {formatMoney(detail.price)}
                </span>
                {onSale && detail.compareAtPrice && (
                  <span className="font-mono text-base text-muted-foreground line-through">
                    {formatMoney(detail.compareAtPrice)}
                  </span>
                )}
              </div>

              <ProductStockIndicator
                inStock={detail.inStock}
                lowStock={detail.lowStock}
              />

              {colors.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <ColorDots colors={colors} />
                  <p className="text-xs text-muted-foreground">
                    {dict.quickView.variantsNote}
                  </p>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-2.5 pt-2">
                <div className="flex items-stretch gap-2.5">
                  <div className="flex-1">
                    <AddToCartButton
                      productId={detail.id}
                      disabled={!detail.inStock}
                    />
                  </div>
                  <WishlistToggleButton
                    productId={detail.id}
                    productName={detail.name}
                    variant="inline"
                  />
                </div>
                <Link
                  href={`/products/${product.slug}`}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {dict.quickView.viewFullDetails}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
