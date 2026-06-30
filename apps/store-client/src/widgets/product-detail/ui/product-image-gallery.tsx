"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductImageEntity } from "@/entities/product";
import { BLUR_PLACEHOLDER, ProductThumb } from "@/shared/ui";

interface ProductImageGalleryProps {
  images: ProductImageEntity[];
  /** Product name, used as alt fallback when an image has no alt text. */
  altFallback: string;
}

/** Coerce the generated `alt` field (typed loosely as an object) to a string. */
export function altText(image: ProductImageEntity, fallback: string): string {
  const raw: unknown = image.alt;
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

/**
 * ProductImageGallery — main image with a clickable thumbnail strip.
 * Selecting a thumbnail swaps the main image. Images that fail to load (or a
 * product with none) fall back to a styled gradient placeholder so the page
 * never shows a broken-image icon.
 */
export function ProductImageGallery({
  images,
  altFallback,
}: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  const markFailed = (id: string) =>
    setFailed((prev) => (prev[id] ? prev : { ...prev, [id]: true }));

  const activeImage = images[activeIndex] ?? images[0];
  const showPlaceholder = !activeImage || failed[activeImage.id];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
        {showPlaceholder ? (
          <ProductThumb
            name={altFallback}
            className="size-full"
            initialClassName="text-7xl"
          />
        ) : (
          <Image
            src={activeImage.url}
            alt={altText(activeImage, altFallback)}
            fill
            // PDP layout: ~100vw mobile, ~half the content column on tablet,
            // capped at the 640px content-column width on desktop.
            sizes="(max-width: 767px) calc(100vw - 3rem), (max-width: 1279px) calc(50vw - 4rem), 640px"
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            // Above-the-fold LCP element on the PDP — load eagerly.
            // Next.js 16 renamed the `priority` prop to `preload`.
            preload
            onError={() => markFailed(activeImage.id)}
            className="size-full object-cover"
          />
        )}
      </div>

      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {images.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`Show image ${index + 1}`}
                  onClick={() => setActiveIndex(index)}
                  className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? "border-primary" : "border-border"
                  }`}
                >
                  {failed[image.id] ? (
                    <ProductThumb
                      name={`${altFallback} ${index + 1}`}
                      className="size-full"
                      initialClassName="text-lg"
                    />
                  ) : (
                    // Fixed 64x64 thumbnail — explicit dimensions instead of `fill`.
                    // No blur placeholder: at 64px the shimmer is imperceptible.
                    <Image
                      src={image.url}
                      alt={altText(
                        image,
                        `${altFallback} thumbnail ${index + 1}`,
                      )}
                      width={64}
                      height={64}
                      onError={() => markFailed(image.id)}
                      className="size-full object-cover"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
