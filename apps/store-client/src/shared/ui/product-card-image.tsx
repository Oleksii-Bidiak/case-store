"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { BLUR_PLACEHOLDER } from "./image-placeholder";

/**
 * Default `sizes` for the responsive catalog grid
 * (`repeat(auto-fill, minmax(232px, 1fr))` inside the `max-w-7xl` container):
 * one column on phones, two up to `lg`, then ~232–300px columns. The desktop
 * entry is a fixed 300px cap — the old `calc(25vw - 2rem)` over-downloaded on
 * wide screens (480px+ candidates for a ≤300px slot) since the container is
 * capped anyway (TASK-210).
 */
const GRID_SIZES =
  "(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), 300px";

interface ProductCardImageProps {
  /** Primary image URL, or empty/undefined when the product has no image. */
  src?: string;
  /** Meaningful alt text (usually the image alt or the product name). */
  alt: string;
  /** Product initial shown over the gradient placeholder when there is no image. */
  initial: string;
  /**
   * Per-image LQIP data URI (TASK-091). When present it is used as the
   * `blurDataURL`, giving a real blur-up that resembles the final image; when
   * absent (GIF or a legacy image) the generic TASK-074 shimmer is used instead.
   */
  blurDataUrl?: string | null;
  /**
   * Eager-load above-the-fold cards (first grid row) for a better LCP. Cards
   * below the fold keep the default lazy behaviour. Defaults to `false`.
   */
  priority?: boolean;
  /**
   * Rendered-width hint for `next/image` srcset selection. Defaults to the
   * responsive catalog-grid profile; contexts with a known fixed slot MUST
   * override it (rails: card is 244/260px wide; catalog list rows: 150px
   * thumbnail), otherwise small viewports download full-width candidates
   * (TASK-210).
   */
  sizes?: string;
}

/**
 * ProductCardImage — the image slot of a `ProductCard`, isolated as a Client
 * Component so the surrounding card can stay a Server Component. It owns the
 * single `onError` boolean: when the remote image fails to load it swaps to the
 * gradient initial placeholder instead of a broken-image icon. When there is no
 * `src` at all, the placeholder renders directly without attempting an `<Image>`.
 *
 * The gradient background lives on the parent container in `ProductCard`, so
 * this component only renders the image (filling that container) or the
 * initial/icon overlay.
 */
export function ProductCardImage({
  src,
  alt,
  initial,
  blurDataUrl,
  priority = false,
  sizes = GRID_SIZES,
}: ProductCardImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (showImage) {
    return (
      <Image
        src={src as string}
        alt={alt}
        fill
        sizes={sizes}
        placeholder="blur"
        blurDataURL={blurDataUrl ?? BLUR_PLACEHOLDER}
        // Next.js 16 renamed the LCP `priority` prop to `preload`. With
        // `preload={false}` and no `loading` prop, next/image emits
        // `loading="lazy"` (verified in get-img-props: `isLazy = !preload &&
        // loading === undefined`), so non-priority cards are NOT eagerly
        // fetched — do not add `loading` here, it conflicts with `preload`.
        preload={priority}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    );
  }

  // No image (or it failed to load) — styled gradient initial placeholder.
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span
        aria-hidden="true"
        className="text-6xl font-bold tracking-tight opacity-60 select-none font-display"
      >
        {initial}
      </span>
      <ImageIcon
        className="absolute bottom-3 right-3 size-5 opacity-50"
        aria-hidden="true"
      />
    </div>
  );
}
