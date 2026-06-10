"use client";

import { useState } from "react";
import type { ProductImageEntity } from "@/entities/product";

interface ProductImageGalleryProps {
  images: ProductImageEntity[];
  /** Product name, used as alt fallback when an image has no alt text. */
  altFallback: string;
}

/** Coerce the generated `alt` field (typed loosely as an object) to a string. */
function altText(image: ProductImageEntity, fallback: string): string {
  const raw: unknown = image.alt;
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

/**
 * ProductImageGallery — main image with a clickable thumbnail strip.
 * Selecting a thumbnail swaps the main image. Handles the empty-image case
 * with a muted placeholder.
 */
export function ProductImageGallery({
  images,
  altFallback,
}: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div
        role="img"
        aria-label="No image available"
        className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
      >
        No image available
      </div>
    );
  }

  const activeImage = images[activeIndex] ?? images[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- Next <Image> deferred to Phase 5 (needs dimensions + CDN) */}
        <img
          src={activeImage.url}
          alt={altText(activeImage, altFallback)}
          className="size-full object-cover"
        />
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
                  className={`size-16 shrink-0 overflow-hidden rounded-md border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? "border-primary" : "border-border"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                  <img
                    src={image.url}
                    alt={altText(
                      image,
                      `${altFallback} thumbnail ${index + 1}`,
                    )}
                    className="size-full object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
