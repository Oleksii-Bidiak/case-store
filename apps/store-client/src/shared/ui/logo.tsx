"use client";

import { useState } from "react";
import Image from "next/image";
import { SITE_NAME } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { isOptimizableImageSrc } from "./category-tile-image";

/**
 * Rendered box for an uploaded logo. Height matches the monogram fallback
 * (`size-9` = 36px) so swapping a logo in never changes the header/footer row
 * height; the width is a max, not a fixed size — `object-contain` letterboxes a
 * narrower or wider mark inside it. Both are passed as intrinsic width/height so
 * the browser reserves the box before the file lands (no layout shift).
 */
const LOGO_HEIGHT = 36;
const LOGO_MAX_WIDTH = 160;

/** SVG is served straight from store-api, never through the Next optimizer. */
function isSvgUrl(src: string): boolean {
  const path = src.split("?")[0].split("#")[0];
  return path.toLowerCase().endsWith(".svg");
}

interface LogoProps {
  /**
   * `SeoSettings.logoUrl` — an absolute URL under the store-api `/uploads/branding/`
   * path (or null/undefined when the operator has not uploaded a logo yet).
   */
  logoUrl?: string | null;
  /** Extra classes on the wrapper (spacing/typography of the call site). */
  className?: string;
  /** Extra classes on the monogram square of the typographic fallback. */
  markClassName?: string;
}

/**
 * Logo — the store's brand mark, shared by the header, the mobile menu title and
 * the footer (TASK-299). Renders the admin-uploaded logo when
 * `SeoSettings.logoUrl` is set, and otherwise the original typographic
 * monogram + wordmark, unchanged — so a store that never uploads anything looks
 * exactly as it did before. An uploaded logo REPLACES the wordmark (logos
 * normally carry the brand name themselves), which is why the image alt is the
 * site name: the accessible name of the link stays "MobileStore" either way.
 *
 * Rendering path per file type:
 *   • SVG → a plain `<img>`. `next/image` refuses to optimize SVG unless
 *     `images.dangerouslyAllowSVG` is on, and that flag would let ANY SVG the
 *     optimizer can reach be served from our origin — not worth it for one asset
 *     that is already tiny and already sanitized server-side (store-api strips
 *     scripts/handlers/foreignObject on upload).
 *   • raster on an allow-listed host → `next/image` (resized/AVIF-WebP).
 *   • raster anywhere else → a plain `<img>`: `next/image` THROWS during render
 *     when the host is not in `images.remotePatterns`, so an operator whose API
 *     serves uploads from an unconfigured CDN would take the whole page down.
 *     Degrading to an unoptimized `<img>` keeps the store up.
 * A load failure (deleted file, API down) falls back to the monogram rather than
 * leaving a broken-image icon in the header of every page.
 */
export function Logo({ logoUrl, className, markClassName }: LogoProps) {
  // Track the URL that failed to load, not a bare boolean: the header and footer
  // live in the root layout and persist across client navigations, so a stale
  // `failed=true` would keep showing the monogram even after the operator
  // uploads a working logo (a new `logoUrl` arrives via ISR without a full page
  // reload). Comparing the current URL against the failed one resets the fallback
  // the instant the URL changes — a render-time derivation, no effect needed.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const trimmed = logoUrl?.trim() || null;
  const src = trimmed && trimmed !== failedUrl ? trimmed : null;

  const wrapper = cn("inline-flex items-center gap-2", className);

  if (!src) {
    return (
      <span className={wrapper}>
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground",
            markClassName,
          )}
        >
          {SITE_NAME.charAt(0)}
        </span>
        <span className="font-display text-xl font-bold tracking-tight">
          {SITE_NAME}
        </span>
      </span>
    );
  }

  // Mirrors LOGO_HEIGHT / LOGO_MAX_WIDTH above (no spacing token maps onto them):
  // the height is fixed so the row never resizes, the width only capped so a wide
  // or narrow mark is letterboxed rather than stretched.
  const imageClass = "h-9 w-auto max-w-[160px] object-contain";

  return (
    <span className={wrapper}>
      {isSvgUrl(src) || !isOptimizableImageSrc(src) ? (
        // eslint-disable-next-line @next/next/no-img-element -- see the rendering-path note above: SVG must bypass the optimizer, and a non-allow-listed host would make next/image throw
        <img
          src={src}
          alt={SITE_NAME}
          width={LOGO_MAX_WIDTH}
          height={LOGO_HEIGHT}
          className={imageClass}
          onError={() => setFailedUrl(trimmed)}
        />
      ) : (
        <Image
          src={src}
          alt={SITE_NAME}
          width={LOGO_MAX_WIDTH}
          height={LOGO_HEIGHT}
          sizes={`${LOGO_MAX_WIDTH}px`}
          priority
          className={imageClass}
          onError={() => setFailedUrl(trimmed)}
        />
      )}
    </span>
  );
}
