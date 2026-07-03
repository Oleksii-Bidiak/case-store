"use client";

import { Truck, Package, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { dict } from "@/shared/config";
import { ProductReviewsWidget } from "@/widgets/product-reviews";

// Icons for the static delivery-method rows, matched to dict.product.deliveryOptions.
const DELIVERY_ICONS = [Truck, Package, MapPin] as const;

/**
 * ProductSpecsTabs — Description / Specifications / Reviews / Delivery tabs for
 * the PDP. Specifications stays a placeholder until the product entity carries
 * structured specs (TASK-178); the Reviews tab renders the live
 * {@link ProductReviewsWidget}; Delivery lists the storefront's static shipping
 * methods (curated copy — the real per-order options live in `/checkout`).
 */
export function ProductSpecsTabs({
  description,
  productId,
}: {
  description: string | null;
  productId: string;
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

      <TabsContent value="specs" className="pt-5 text-sm text-muted-foreground">
        {dict.product.specsEmpty}
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
