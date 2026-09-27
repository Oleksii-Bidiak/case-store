"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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
 *
 * The page around it is server-rendered (the `/blog/[slug]` cover), so the
 * browser can finish — and fail — the load before React hydrates and attaches
 * `onError`; that event is then simply lost and the broken box stays. After
 * mount, a load that already ended with no picture is replayed by re-assigning
 * `src`, so the error fires again with the handler in place — the workaround
 * `next/image` ships. A picture that loaded fine is not touched.
 */
export function FallbackImg({
  src,
  alt,
  className,
  fallback = null,
}: FallbackImgProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const trimmed = src?.trim() || null;

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) {
      img.src = img.src;
    }
  }, [trimmed]);

  if (!trimmed || trimmed === failedUrl) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin URLs from arbitrary hosts; next/image would throw on a non-allow-listed host
    <img
      ref={imgRef}
      src={trimmed}
      alt={alt}
      className={className}
      onError={() => setFailedUrl(trimmed)}
    />
  );
}
