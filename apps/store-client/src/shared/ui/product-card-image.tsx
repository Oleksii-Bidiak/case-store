"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { BLUR_PLACEHOLDER } from "./image-placeholder";

/**
 * Default `sizes` for the responsive catalog grid
 * (`grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4` inside the `max-w-7xl`
 * container): one column on the narrowest phones, two from 390px, four from
 * `lg` (~292px slots at the capped container width). The desktop entry is a
 * fixed 300px cap — `calc(25vw - 2rem)` over-downloaded on wide screens (480px+
 * candidates for a ≤300px slot) since the container is capped anyway (TASK-210).
 *
 * The first breakpoint tracks the GRID, not a Tailwind breakpoint: the grid goes
 * two-up at 390px (TASK-415), so a 390–639px viewport gets half-width cards and
 * must not be told to download a full-viewport candidate.
 */
const GRID_SIZES =
  "(max-width: 389px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), 300px";

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
        // `||`, not `??`: the shared shimmer must only stand in when the image
        // has NO usable LQIP of its own. `??` let an empty string through, and
        // `placeholder="blur"` with an empty `blurDataURL` renders no
        // placeholder at all (next/image treats it as a missing value and
        // throws in dev) — a per-image LQIP always wins, a blank one never does.
        blurDataURL={blurDataUrl || BLUR_PLACEHOLDER}
        // Next.js 16 renamed the LCP `priority` prop to `preload`. With
        // `preload={false}` and no `loading` prop, next/image emits
        // `loading="lazy"` (verified in get-img-props: `isLazy = !preload &&
        // loading === undefined`), so non-priority cards are NOT eagerly
        // fetched — do not add `loading` here, it conflicts with `preload`.
        preload={priority}
        onError={() => setFailed(true)}
        // `object-contain`, not `object-cover` (TASK-415): accessory photos are
        // shot in different aspect ratios, and cropping them to the square box
        // cut off plugs, straps and case edges — the box stays fixed (no layout
        // shift), the photo is letterboxed over the card's gradient instead.
        // The hover zoom lives HERE and only here: card wrappers used to add a
        // second `[&_img]:transition-transform [&_img]:duration-500` on top of
        // this one (the descendant selector won, so the declared 300ms never
        // ran). One declaration, one duration, reduced-motion aware.
        className="absolute inset-0 h-full w-full object-contain transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transition-none"
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
