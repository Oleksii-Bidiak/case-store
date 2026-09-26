"use client";

import { useState, type ReactNode } from "react";

interface FallbackImgProps {
  /** Free-text admin URL — may be absent, foreign (CSP-blocked) or broken. */
  src?: string | null;
  alt: string;
  className?: string;
  /** Rendered instead when there is no URL or the picture fails to load. */
  fallback?: ReactNode;
}

/**
 * FallbackImg — a plain `<img>` for admin-entered URLs that must not go
 * through `next/image` (any host the operator pastes), with the same
 * failure handling as `Logo` (TASK-759).
 *
 * Since the storefront CSP narrowed `img-src` to the API origin and
 * `NEXT_PUBLIC_IMAGE_HOSTS` (TASK-452), a picture from any other host is
 * blocked and fires `error`. Without a handler the browser keeps a broken,
 * empty box; this swaps in `fallback` (nothing by default, so a backdrop
 * behind it shows). The URL that failed is remembered rather than a boolean,
 * so a new URL arriving on the same mounted element is tried again — a
 * render-time comparison, no effect needed.
 */
export function FallbackImg({
  src,
  alt,
  className,
  fallback = null,
}: FallbackImgProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const trimmed = src?.trim() || null;

  if (!trimmed || trimmed === failedUrl) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin URLs from arbitrary hosts; next/image would throw on a non-allow-listed host
    <img
      src={trimmed}
      alt={alt}
      className={className}
      onError={() => setFailedUrl(trimmed)}
    />
  );
}
