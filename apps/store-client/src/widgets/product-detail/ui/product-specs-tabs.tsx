"use client";

import { Truck, Package, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { ProductSpecEntity } from "@/entities/product";
import { ProductReviewsWidget } from "@/widgets/product-reviews";
import { formatSpecValue } from "./format-spec";

// Icons for the static delivery-method rows, matched to dict.product.deliveryOptions.
const DELIVERY_ICONS = [Truck, Package, MapPin] as const;

/**
 * ProductSpecsTabs — Description / Specifications / Reviews / Delivery tabs for
 * the PDP. The Specifications tab renders the product's structured specs
 * (TASK-191), falling back to the empty-state copy when a product has none; the
 * Reviews tab renders the live {@link ProductReviewsWidget}; Delivery lists the
 * storefront's static shipping methods (curated copy — the real per-order
 * options live in `/checkout`).
 */
export function ProductSpecsTabs({
  description,
  productId,
  specs,
}: {
  description: string | null;
  productId: string;
  specs: ProductSpecEntity[];
}) {
  return (
    <Tabs defaultValue="description" className="w-full">
      <TabsList className="w-full max-w-2xl flex-wrap">
        <TabsTrigger value="description">
          {dict.product.tabDescription}
        </TabsTrigger>
        <TabsTrigger value="specs">{dict.product.tabSpecs}</TabsTrigger>
        <TabsTrigger value="reviews">{dict.product.tabReviews}</TabsTrigger>
        <TabsTrigger value="delivery">{dict.product.tabDelivery}</TabsTrigger>
      </TabsList>

      <TabsContent
        value="description"
        className="max-w-3xl pt-5 text-[15px] leading-[1.7] whitespace-pre-line text-foreground"
      >
        {description && description.length > 0
          ? description
          : dict.product.specsEmpty}
      </TabsContent>

      <TabsContent value="specs" className="pt-5">
        {specs.length > 0 ? (
          <dl className="grid max-w-2xl grid-cols-1 gap-y-0 text-sm">
            {specs.map((spec) => (
              <div
                key={spec.key}
                className="flex items-baseline justify-between gap-4 border-b border-border py-2.5"
              >
                <dt className="text-muted-foreground">{spec.label}</dt>
                <dd className="text-right font-medium text-foreground">
                  {formatSpecValue(spec)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            {dict.product.specsEmpty}
          </p>
        )}
      </TabsContent>

      <TabsContent value="reviews" className="pt-5">
        <ProductReviewsWidget productId={productId} />
      </TabsContent>

      <TabsContent value="delivery" className="pt-5">
        <div className="flex max-w-3xl flex-col gap-3">
          {dict.product.deliveryOptions.map((option, i) => {
            const Icon = DELIVERY_ICONS[i] ?? Truck;
            return (
              <div
                key={option.title}
                className="flex items-center gap-4 rounded-[14px] border border-border bg-card p-[18px]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-card))] text-primary">
                  <Icon className="size-[22px]" aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <b className="block text-[14.5px] font-semibold text-foreground">
                    {option.title}
                  </b>
                  <span className="text-[13px] text-muted-foreground">
                    {option.text}
                  </span>
                </div>
                <b
                  className={`font-mono text-sm whitespace-nowrap ${
                    option.free ? "text-success" : "text-foreground"
                  }`}
                >
                  {option.price}
                </b>
              </div>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
}
