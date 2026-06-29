"use client";

import { useState } from "react";
import Link from "next/link";
import type { OrderItemEntity } from "@/entities/order";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { ProductThumb } from "@/shared/ui";

/**
 * OrderItemRow — a single ordered line. Shows the product image (with a
 * placeholder fallback) and links to the product PDP. Client component because
 * the `<img>` onError fallback needs local state; the parent list stays a
 * server component. Image rendering mirrors the cart line (TASK-133); next/image
 * migration is deferred to TASK-042.
 */
export function OrderItemRow({ item }: { item: OrderItemEntity }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <li className="flex items-start justify-between gap-3 border-b border-border pb-4 text-sm">
      <Link
        href={`/products/${item.productSlug}`}
        aria-label={dict.order.viewProductAria(item.productName)}
        className="flex items-start gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {item.imageUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.productName}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="size-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <ProductThumb
            name={item.productName}
            className="size-14 shrink-0 rounded-lg"
            initialClassName="text-lg"
          />
        )}
        <div className="flex flex-col">
          <span className="text-foreground">{item.productName}</span>
          <span className="text-muted-foreground">
            {item.quantity} × {formatMoney(item.price)}
          </span>
        </div>
      </Link>
      <span className="font-medium text-foreground">
        {formatMoney(item.lineTotal)}
      </span>
    </li>
  );
}
