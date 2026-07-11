"use client";

import { useState, type ReactNode } from "react";

interface CategoryTileImageProps {
  /** Category image URL (free-text admin field — may be absent or broken). */
  src?: string | null;
  /**
   * "" for decorative use when an adjacent, visible caption already names the
   * category inside the same link (both current call sites use "") — a
   * non-empty alt would double-announce the name to screen readers.
   */
  alt: string;
  className?: string;
  /** Icon/gradient markup rendered when there is no image, or it fails to load. */
  fallback: ReactNode;
}

/**
 * CategoryTileImage — renders `Category.image` when present and loadable,
 * otherwise the caller's fallback markup (icon + tint/gradient). Failure state
 * is local to each mounted instance, so one broken URL never affects sibling
 * tiles. Shared in `shared/ui` because the two consumers (`widgets/category-nav`
 * and `widgets/categories`) are FSD peers and may not import from each other.
 */
export function CategoryTileImage({
  src,
  alt,
  className,
  fallback,
}: CategoryTileImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <>{fallback}</>;
  }
  return (
    // free-text admin URL (no upload endpoint, no host allowlist) — see plan 155
    // §Design decision; mirrors the existing BlogPost.coverImageUrl precedent.
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
