"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import type { ProductImageEntity } from "@/entities/product";
import { dict } from "@/shared/config";
import { BLUR_PLACEHOLDER, ProductThumb } from "@/shared/ui";

/**
 * Delay before the image-switch loading overlay becomes visible. Instant cache
 * hits fire `onLoad` well within this window, so they never flash the spinner;
 * only genuinely slow network loads get the affordance (TASK-214).
 */
export const IMAGE_LOADING_INDICATOR_DELAY_MS = 120;

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
 *
 * While a newly selected image is still downloading, the main frame keeps the
 * blur placeholder and — after {@link IMAGE_LOADING_INDICATOR_DELAY_MS} — shows
 * a subtle spinner overlay until `onLoad` fires (TASK-214). The frame has a
 * fixed aspect ratio, so the swap causes no layout shift. `onError` clears the
 * indicator and falls back to the gradient placeholder instead of spinning
 * forever.
 */
export function ProductImageGallery({
  images,
  altFallback,
}: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  // Images whose full-size version has fired `onLoad` at least once — switching
  // back to them is an instant cache hit, so they never re-show the indicator.
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  // Id of the image the delayed timer has armed the indicator for. Visibility
  // is derived at render time (`indicatorForId === pendingId`), so a stale id
  // left behind after a load/switch is inert — no state reset needed.
  const [indicatorForId, setIndicatorForId] = useState<string | null>(null);

  const markFailed = (id: string) =>
    setFailed((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  const markLoaded = (id: string) =>
    setLoaded((prev) => (prev[id] ? prev : { ...prev, [id]: true }));

  const activeImage = images[activeIndex] ?? images[0];
  const showPlaceholder = !activeImage || failed[activeImage.id];

  // Id of the active image while it is still loading (not yet loaded/failed);
  // null once settled. Drives the delayed-visibility timer below.
  const pendingId =
    activeImage && !showPlaceholder && !loaded[activeImage.id]
      ? activeImage.id
      : null;

  useEffect(() => {
    if (!pendingId) return;
    const timer = window.setTimeout(
      () => setIndicatorForId(pendingId),
      IMAGE_LOADING_INDICATOR_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [pendingId]);

  const indicatorVisible = pendingId !== null && indicatorForId === pendingId;

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
            // Per-image LQIP when the API supplies one (TASK-091); otherwise the
            // generic TASK-074 shimmer.
            blurDataURL={activeImage.blurDataUrl ?? BLUR_PLACEHOLDER}
            // Above-the-fold LCP element on the PDP — load eagerly.
            // Next.js 16 renamed the `priority` prop to `preload`.
            preload
            onLoad={() => markLoaded(activeImage.id)}
            onError={() => markFailed(activeImage.id)}
            className="size-full object-cover"
          />
        )}

        {/* Image-switch loading overlay — delayed so cache hits never flash it.
            `motion-reduce:animate-none` leaves a static icon for users who
            prefer reduced motion. */}
        {indicatorVisible && !showPlaceholder && (
          <div
            role="status"
            aria-label={dict.product.imageLoading}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40"
          >
            <Loader2
              className="size-8 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
          </div>
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
                  aria-label={dict.product.showImageAria(index + 1)}
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
                        dict.product.imageThumbnailAlt(index + 1),
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
