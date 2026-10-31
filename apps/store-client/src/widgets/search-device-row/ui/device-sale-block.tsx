"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { PublicProductEntity } from "@/shared/api/generated/models";
import { SEARCH_DEVICE_FOCUS, type DeviceKind } from "@/features/search";
import { dict } from "@/shared/config";
import { PRODUCT_GRID_CLASS } from "@/shared/config/product-grid";
import { formatMoney } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";

import { DEVICE_SALE_CATEGORY, minDevicePrice } from "../model/sold-devices";

interface DeviceSaleBlockProps {
  modelName: string;
  /** Brand for «Усі смартфони Apple» — the model's device brand. */
  brandName: string;
  kind: DeviceKind;
  /** The devices of the model on sale (already filtered, ≥ 1). */
  products: readonly PublicProductEntity[];
  /** `before` = the query asked for the device → «Сам пристрій» first. */
  placement: "before" | "after";
}

/**
 * «Сам … у продажу» (TASK-2069, Д3-2; owner 2026-10-30: the store sells the
 * phones too). The catalogue's own cards for the model's devices, under a
 * heading with the lowest price and a way to every device of the brand.
 */
export function DeviceSaleBlock({
  modelName,
  brandName,
  kind,
  products,
  placement,
}: DeviceSaleBlockProps) {
  const headingId = useId();
  const copy = dict.searchDevice.sale;
  const minPrice = minDevicePrice(products);
  // The product brand slug filters the device category («Усі смартфони
  // Apple»); without one, the whole category.
  const brandSlug = products.find((p) => p.brand?.slug)?.brand?.slug;
  const allHref = `/categories/${DEVICE_SALE_CATEGORY[kind]}${
    brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""
  }`;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">
            {placement === "before" ? copy.kickerFirst : copy.kickerAfter[kind]}
          </p>
          <h2
            id={headingId}
            className="mt-0.5 font-display text-xl leading-tight font-bold text-foreground md:text-2xl"
          >
            {minPrice
              ? copy.title(modelName, formatMoney(minPrice))
              : modelName}
          </h2>
        </div>
        <Link
          href={allHref}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-foreground underline-offset-3 hover:underline",
            SEARCH_DEVICE_FOCUS,
          )}
        >
          {copy.allOf[kind](brandName)}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </div>
      <div className={PRODUCT_GRID_CLASS}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            action={<ProductCardActions product={product} />}
            hoverAction={<ProductQuickViewTrigger product={product} />}
          />
        ))}
      </div>
    </section>
  );
}
