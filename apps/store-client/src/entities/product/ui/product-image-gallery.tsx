"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Expand, Loader2, X } from "lucide-react";
// Own slice — importing the `@/entities/product` barrel from inside it would be
// a module cycle (barrel → ui → barrel), so the type comes straight from the
// generated models the barrel itself re-exports.
import type { ProductImageEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import {
  BLUR_PLACEHOLDER,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ProductThumb,
} from "@/shared/ui";

/**
 * Delay before the image-switch loading overlay becomes visible. Instant cache
 * hits fire `onLoad` well within this window, so they never flash the spinner;
 * only genuinely slow network loads get the affordance (TASK-214).
 */
export const IMAGE_LOADING_INDICATOR_DELAY_MS = 120;

/**
 * Horizontal travel (px) a touch must cover before the lightbox treats it as a
 * swipe rather than a tap or a vertical scroll (TASK-416).
 */
export const SWIPE_THRESHOLD_PX = 48;

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
  const touchStartX = useRef<number | null>(null);

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

  const handleLightboxKeyDown = (event: React.KeyboardEvent) => {
    if (images.length < 2) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null || images.length < 2) return;
    const delta = (event.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    step(delta < 0 ? 1 : -1);
  };

  const lightboxImage = images[activeIndex] ?? images[0];
  const lightboxFailed = !lightboxImage || failed[lightboxImage.id];

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

        {/* Full-frame zoom trigger (TASK-416). Offered only when there is a real
            photo — the gradient placeholder has nothing to enlarge. */}
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
              className="absolute right-3 bottom-3 grid size-10 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-card transition-colors duration-200 ease-out group-hover:bg-background"
            >
              <Expand className="size-5" />
            </span>
          </button>
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

      {/* Lightbox. Full-viewport at every breakpoint: a photo is the content, so
          it gets the whole screen rather than a centred card. Radix supplies the
          focus trap, the Esc handler and the scroll lock; `onCloseAutoFocus`
          overrides only WHERE focus lands so it is always the zoom trigger. */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          onKeyDown={handleLightboxKeyDown}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            zoomButtonRef.current?.focus();
          }}
          // The primitive's built-in close is a bare 16px icon — fine inside a
          // padded card, far below the 44px touch target on a full-bleed photo.
          // Composed here instead, matching the prev/next controls.
          showCloseButton={false}
          className="inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{dict.product.lightboxTitle(altFallback)}</DialogTitle>
            <DialogDescription>{dict.product.lightboxHint}</DialogDescription>
          </DialogHeader>

          <DialogClose className="absolute top-3 right-3 z-10 grid size-12 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-elevated transition-colors duration-200 ease-out hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:top-4 sm:right-4">
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{dict.common.close}</span>
          </DialogClose>

          <div
            className="relative flex h-dvh flex-col"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="relative min-h-0 flex-1">
              {lightboxFailed ? (
                <ProductThumb
                  name={altFallback}
                  className="size-full"
                  initialClassName="text-7xl"
                />
              ) : (
                <Image
                  src={lightboxImage.url}
                  alt={altText(lightboxImage, altFallback)}
                  fill
                  sizes="100vw"
                  onError={() => markFailed(lightboxImage.id)}
                  // Never crop in the lightbox: this is the one place a shopper
                  // expects to see the whole product, edges included.
                  className="size-full object-contain p-4 sm:p-12"
                />
              )}
            </div>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={dict.product.lightboxPrev}
                  className="absolute top-1/2 left-2 grid size-12 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-elevated transition-colors duration-200 ease-out hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-4"
                >
                  <ChevronLeft aria-hidden="true" className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={dict.product.lightboxNext}
                  className="absolute top-1/2 right-2 grid size-12 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-elevated transition-colors duration-200 ease-out hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-4"
                >
                  <ChevronRight aria-hidden="true" className="size-6" />
                </button>
                <p
                  role="status"
                  className="pb-6 text-center text-sm tabular-nums text-muted-foreground"
                >
                  {dict.product.lightboxCounter(activeIndex + 1, images.length)}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
