"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Expand, Loader2 } from "lucide-react";
// Own slice — importing the `@/entities/product` barrel from inside it would be
// a module cycle (barrel → ui → barrel), so the type comes straight from the
// generated models the barrel itself re-exports.
import type { ProductImageEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { pickProductGradient } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { BLUR_PLACEHOLDER, ProductThumb } from "@/shared/ui";
import { ProductLightbox } from "./product-lightbox";

/**
 * Delay before the image-switch loading overlay becomes visible. Instant cache
 * hits fire `onLoad` well within this window, so they never flash the spinner;
 * only genuinely slow network loads get the affordance (TASK-214).
 */
export const IMAGE_LOADING_INDICATOR_DELAY_MS = 120;

// The lightbox gesture constants live with the rest of its pure math
// (TASK-521); re-exported so existing imports keep resolving.
export { SWIPE_THRESHOLD_PX } from "../lib/lightbox-zoom";

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
 *
 * TASK-416 adds a full-screen lightbox: the main frame carries a transparent
 * zoom button (a visible chip in its corner) that opens a Radix dialog with the
 * uncropped photo, prev/next controls, a counter, arrow-key and swipe
 * navigation. The button deliberately *overlays* the image instead of wrapping
 * it — keeping the `<img>` out of any `<button>` leaves the main photo
 * addressable on its own and avoids a control whose accessible name would be
 * the whole alt text.
 *
 * TASK-521 moves the dialog into {@link ProductLightbox}: zoom toolbar, click /
 * double-tap / pinch zoom into the pointer, drag-to-pan, a minimap and its own
 * thumbnail strip. The gallery still owns the selection, so the lightbox and
 * the strip under the main photo always show the same picture.
 *
 * TASK-518: the main frame and the thumbnails follow the ProductCard rule
 * (design-system.md §4) — a fixed square box over the card gradient with the
 * photo `object-contain` inside, so mixed aspect ratios are letterboxed, never
 * cropped.
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // The zoom trigger — focus returns here when the lightbox closes, so keyboard
  // users land back where they left off instead of at the top of the document.
  const zoomButtonRef = useRef<HTMLButtonElement>(null);

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

  // Wrap-around stepping, shared by the arrow buttons, the arrow keys and the
  // swipe handler. `images.length` guards a division by zero on an empty list.
  const step = useCallback(
    (delta: number) =>
      setActiveIndex((prev) =>
        images.length === 0
          ? prev
          : (prev + delta + images.length) % images.length,
      ),
    [images.length],
  );

  // The same deterministic backdrop as the gradient placeholder (both seeded by
  // the product name), so a letterboxed photo and a missing one sit on one
  // colour and the frame reads like the ProductCard image box (TASK-518).
  const gradient = pickProductGradient(altFallback);

  return (
    <div className="flex flex-col gap-4">
      {/* Fixed square box, gradient behind it: the photo is letterboxed with
          `object-contain` (design-system.md §4, as in ProductCard) — accessory
          photos come in mixed aspect ratios and must never be cropped. */}
      <div
        data-testid="gallery-main-frame"
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-gradient-to-br",
          gradient,
        )}
      >
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
            // PDP layout: ~100vw mobile; from 768px the buy-box rail takes a
            // fixed 360px so the gallery gets the rest of the content width;
            // from 1024px the hero splits into `1fr 1fr 360px`, which caps the
            // gallery column at ~420px inside the 1280px container.
            sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1023px) calc(100vw - 26.25rem), 420px"
            placeholder="blur"
            // Per-image LQIP when the API supplies one (TASK-091); otherwise the
            // generic TASK-074 shimmer.
            blurDataURL={activeImage.blurDataUrl ?? BLUR_PLACEHOLDER}
            // Above-the-fold LCP element on the PDP — load eagerly.
            // Next.js 16 renamed the `priority` prop to `preload`.
            preload
            onLoad={() => markLoaded(activeImage.id)}
            onError={() => markFailed(activeImage.id)}
            className="size-full object-contain"
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

        {/* Full-frame zoom trigger (TASK-416). Offered only when there is a real
            photo — the gradient placeholder has nothing to enlarge.

            Layering (TASK-832, the mockup's note): this transparent button is
            `z-20` over the WHOLE frame, so anything a consumer overlays on the
            frame and wants clickable must sit above it — the PDP puts «В
            обране» at `z-30` in the top-right corner. The visible chip sits in
            the bottom-right corner, 44px tall, so the two never meet. Its
            label «На весь екран» is part of the accessible name. */}
        {!showPlaceholder && (
          <button
            ref={zoomButtonRef}
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={dict.product.zoomAria}
            className="group absolute inset-0 z-20 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span
              aria-hidden="true"
              data-testid="gallery-zoom-chip"
              className="absolute right-3 bottom-3 inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background/80 px-3.5 text-sm font-semibold text-foreground shadow-card backdrop-blur-sm transition-colors duration-200 ease-out group-hover:bg-background"
            >
              <Expand className="size-4" />
              {dict.product.zoomChip}
            </span>
          </button>
        )}
      </div>

      {images.length > 1 && (
        <ul
          // `p-1`: room for the focus ring, which `overflow-x-auto` would clip.
          className="flex gap-2 overflow-x-auto p-1"
        >
          {images.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  aria-label={dict.product.showImageAria(index + 1)}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "size-16 shrink-0 overflow-hidden rounded-lg border-2 bg-gradient-to-br focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    gradient,
                    isActive ? "border-primary" : "border-border",
                  )}
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
                      // Same rule as the main frame: letterbox, never crop.
                      className="size-full object-contain"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Full-screen viewer with zoom, pan and its own thumbnail strip
          (TASK-416, TASK-521). Focus returns to the zoom trigger on close. */}
      <ProductLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={images}
        activeIndex={activeIndex}
        onStep={step}
        onSelect={setActiveIndex}
        altFallback={altFallback}
        failed={failed}
        onImageError={markFailed}
        gradient={gradient}
        returnFocusRef={zoomButtonRef}
      />
    </div>
  );
}
