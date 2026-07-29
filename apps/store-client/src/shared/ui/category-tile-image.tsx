"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";

/** Uploads path prefix — the only path store-api serves images from. */
const UPLOADS_PREFIX = "/uploads/";

/** Squares in both call sites; only used to give `next/image` an aspect ratio. */
const TILE_INTRINSIC_PX = 256;

/**
 * Hosts an operator may additionally allow (comma-separated bare hostnames, e.g.
 * `cdn.mystore.ua,images.brand.com`). Read lazily rather than at module scope so
 * the value is not frozen at import time in tests; in the browser Next inlines
 * the literal at build time, so this costs nothing.
 */
function extraImageHosts(): string[] {
  return (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}

/** store-api origin — the same env var `next.config.ts` derives its pattern from. */
const apiOrigin = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
);

/**
 * Mirrors `images.remotePatterns` in `next.config.ts`. It has to be re-stated
 * here (rather than imported) because `next.config.ts` is loaded by Next's own
 * TS loader, which does not resolve the `@/` alias — keep the two in sync.
 *
 * This is not belt-and-braces: `Category.image` is a free-text admin field, and
 * `next/image` **throws during render** (dev/`next dev`) when a remote `src` does
 * not match `remotePatterns`, so an arbitrary pasted URL would crash the page
 * instead of degrading. In production the optimizer answers 400 and the browser
 * fires `onError` — still a wasted round-trip per tile. Pre-checking the URL
 * keeps both cases on the fallback path, and keeps `data:`/`javascript:` srcs
 * out of the optimizer entirely.
 */
export function isOptimizableImageSrc(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false; // relative path or malformed — never a category image
  }

  const host = url.hostname.toLowerCase();

  // store-api uploads: same protocol/port as the configured API origin, and only
  // under /uploads/ (the pathname the remote pattern pins). This is also where
  // the dev seed's generated tiles live since TASK-365 — it writes real files to
  // `${PUBLIC_BASE_URL}/uploads/products/`, so demo data needs no host of its own.
  if (
    host === apiOrigin.hostname.toLowerCase() &&
    url.protocol === apiOrigin.protocol &&
    url.port === apiOrigin.port &&
    url.pathname.startsWith(UPLOADS_PREFIX)
  ) {
    return true;
  }

  // Everything else is https-only. Wildcard hosts are deliberately unsupported:
  // an exact-match list is the whole point (an over-broad pattern turns the
  // image optimizer into an open proxy fetching arbitrary origins).
  if (url.protocol !== "https:") return false;

  return extraImageHosts().includes(host);
}

interface CategoryTileImageProps {
  /** Category image URL (free-text admin field — may be absent, foreign or broken). */
  src?: string | null;
  /**
   * "" for decorative use when an adjacent, visible caption already names the
   * category inside the same link (both current call sites use "") — a
   * non-empty alt would double-announce the name to screen readers.
   */
  alt: string;
  className?: string;
  /**
   * Rendered width hint for the optimizer's `srcset` pick. Defaults to the wider
   * of the two call sites (the ~200px catalog tile); the 48px header tile may
   * pass its own to stop over-fetching.
   */
  sizes?: string;
  /** Icon/gradient markup rendered when there is no image, or it fails to load. */
  fallback: ReactNode;
}

/**
 * CategoryTileImage — renders `Category.image` through `next/image` when the URL
 * is present, host-allowlisted and loadable; otherwise the caller's fallback
 * markup (icon + tint/gradient). Failure state is local to each mounted
 * instance, so one broken URL never affects sibling tiles. Shared in `shared/ui`
 * because the two consumers (`widgets/category-nav` and `widgets/categories`)
 * are FSD peers and may not import from each other.
 *
 * Intrinsic `width`/`height` (not `fill`) on purpose: both call sites size the
 * image with `size-full` inside their own square box, and `fill` would need a
 * positioned parent that this component does not own.
 */
export function CategoryTileImage({
  src,
  alt,
  className,
  sizes = `${TILE_INTRINSIC_PX}px`,
  fallback,
}: CategoryTileImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed || !isOptimizableImageSrc(src)) {
    return <>{fallback}</>;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={TILE_INTRINSIC_PX}
      height={TILE_INTRINSIC_PX}
      sizes={sizes}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
