"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Truck, Package, MapPin } from "lucide-react";
import {
  RichText,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import type { ProductSpecEntity } from "@/entities/product";
import { ProductReviewsWidget } from "@/widgets/product-reviews";
import { formatSpecValue } from "./format-spec";

// Icons for the static delivery-method rows, matched to dict.product.deliveryOptions.
const DELIVERY_ICONS = [Truck, Package, MapPin] as const;

/**
 * Tab ids mirrored into `?tab=`. The FIRST one is the default and is never
 * written to the URL — a plain `/products/<slug>` must stay the canonical
 * address of the description tab (plan 143 treats extra query params as a
 * distinct URL), and a shopper who never touched the tabs should be able to
 * copy a clean link.
 */
const TAB_VALUES = ["description", "specs", "reviews", "delivery"] as const;
type TabValue = (typeof TAB_VALUES)[number];
const DEFAULT_TAB: TabValue = TAB_VALUES[0];

/**
 * Resolve `?tab=` to a real tab. Anything unknown (typo, stale link, an old
 * value we dropped) silently falls back to the description tab rather than
 * leaving every panel closed.
 */
export function resolveTabParam(raw: string | null): TabValue {
  return TAB_VALUES.includes(raw as TabValue) ? (raw as TabValue) : DEFAULT_TAB;
}

/**
 * ProductSpecsTabs — Description / Specifications / Reviews / Delivery tabs for
 * the PDP. The Specifications tab renders the product's structured specs
 * (TASK-191), falling back to the empty-state copy when a product has none; the
 * Reviews tab renders the live {@link ProductReviewsWidget}; Delivery lists the
 * storefront's static shipping methods (curated copy — the real per-order
 * options live in `/checkout`).
 *
 * TASK-416 makes the selection URL-addressable: the open tab lives in `?tab=`,
 * so "ось характеристики цього чохла" is a shareable link, the back button
 * steps through tabs, and a reload keeps the shopper where they were. The
 * switch uses `router.replace(..., { scroll: false })` — tab changes are not
 * navigation history worth a `push`, and scrolling back to the top of the PDP
 * after clicking a tab that sits halfway down the page would be jarring.
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = resolveTabParam(searchParams.get("tab"));

  const handleValueChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_TAB) {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <Tabs value={value} onValueChange={handleValueChange} className="w-full">
      <TabsList className="w-full max-w-2xl flex-wrap">
        <TabsTrigger value="description">
          {dict.product.tabDescription}
        </TabsTrigger>
        <TabsTrigger value="specs">{dict.product.tabSpecs}</TabsTrigger>
        <TabsTrigger value="reviews">{dict.product.tabReviews}</TabsTrigger>
        <TabsTrigger value="delivery">{dict.product.tabDelivery}</TabsTrigger>
      </TabsList>

      {/* The description is rich text since TASK-361 (the admin edits it in the
          same Tiptap editor pages/blog use, and the catalogue import feeds HTML
          from the supplier file). `RichText` renders API-sanitized markup and
          falls back to a pre-line block for descriptions written before the
          switch, whose line breaks are their only structure. */}
      <TabsContent value="description" className="max-w-3xl pt-5">
        {description && description.length > 0 ? (
          <RichText content={description} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {dict.product.specsEmpty}
          </p>
        )}
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
