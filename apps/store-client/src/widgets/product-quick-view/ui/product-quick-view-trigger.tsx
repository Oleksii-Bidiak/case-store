"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { ProductQuickView } from "./product-quick-view";

interface ProductQuickViewTriggerProps {
  product: PublicProductEntity;
  /** Extra classes for the trigger button (e.g. corner pinning on the list row). */
  className?: string;
}

/**
 * ProductQuickViewTrigger — an eye-icon button that opens {@link ProductQuickView}
 * (TASK-086). Injected into `ProductCard`'s `hoverAction` slot (and pinned to the
 * thumbnail corner in the list-row layout), it sits above the card's stretched
 * link, so clicking it opens the preview without navigating — the same z-20
 * mechanism the wishlist heart already relies on (no preventDefault needed).
 *
 * The dialog is mounted lazily on first open (mirrors `ProductCardActions`'s
 * `CartSheet`) so a grid of dozens of cards never mounts dozens of idle dialogs.
 */
export function ProductQuickViewTrigger({
  product,
  className,
}: ProductQuickViewTriggerProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const openQuickView = () => {
    setMounted(true);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openQuickView}
        aria-label={dict.quickView.trigger(product.name)}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-lg bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
      >
        <Eye aria-hidden="true" className="size-4" />
      </button>
      {mounted && (
        <ProductQuickView
          product={product}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
