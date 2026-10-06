"use client";

import { useState } from "react";
import Image from "next/image";
import { pickProductGradient } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { ProductThumb } from "@/shared/ui";

interface OrderItemThumbProps {
  /** The snapshotted product name — seeds the placeholder gradient. */
  productName: string;
  /** The line's primary image, `null` when the product has none. */
  imageUrl?: string | null;
  /** Size + radius of the frame, e.g. `size-13 rounded-menu`. */
  className?: string;
  /** `next/image` `sizes` — the rendered frame width. */
  sizes?: string;
}

/**
 * OrderItemThumb — one ordered line's picture (TASK-217). Decorative: the
 * caller names the products in text.
 *
 * Design-system §4: the photo sits `object-contain` in a square frame over the
 * product's gradient, so mixed aspect ratios are never cropped. Without a URL,
 * or once the image fails, the `ProductThumb` placeholder (initial over the
 * same gradient) takes its place — the failed URL is remembered rather than a
 * boolean, so a new URL on the same element is tried again.
 */
export function OrderItemThumb({
  productName,
  imageUrl,
  className,
  sizes = "52px",
}: OrderItemThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!imageUrl || imageUrl === failedUrl) {
    return (
      <ProductThumb
        name={productName}
        className={cn("shrink-0", className)}
        initialClassName="text-lg"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block shrink-0 overflow-hidden bg-gradient-to-br",
        pickProductGradient(productName),
        className,
      )}
    >
      <Image
        src={imageUrl}
        alt=""
        fill
        sizes={sizes}
        onError={() => setFailedUrl(imageUrl)}
        className="object-contain"
      />
    </span>
  );
}
