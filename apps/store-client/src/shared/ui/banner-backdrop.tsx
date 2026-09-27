"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import { isOptimizableImageSrc } from "./category-tile-image";

interface BannerBackdropProps {
  /** `Banner.imageUrl` — free-text admin field: may be absent, foreign or broken. */
  src?: string | null;
  /** Rendered width hint for the optimizer's `srcset` pick. */
  sizes: string;
  /**
   * Tint laid over the picture so the banner's overlaid copy keeps its
   * contrast — the same colour family as the gradient it replaces.
   */
  scrimClassName: string;
  /** The hero's first slide is the homepage LCP; everything else lazy-loads. */
  preload?: boolean;
}

/**
 * BannerBackdrop — the admin-uploaded picture behind a homepage banner
 * (TASK-740: hero slides, promo tiles, the wide promo banner). Until then
 * `Banner.imageUrl` was stored and never rendered.
 *
 * Renders an absolutely positioned `-z-10` layer, so the caller's box must be
 * `relative isolate overflow-hidden`; the banner's own gradient stays on that
 * box and is simply covered. When there is no URL, the URL is not an allowed
 * image origin (the same rule as category tiles: store-api `/uploads/` or an
 * operator-listed https host) or the picture fails to load, it renders NOTHING
 * and the gradient shows exactly as before.
 *
 * `alt=""`: the picture is decoration under the banner's own title, subtitle
 * and CTA, which already say everything a screen reader needs.
 */
export function BannerBackdrop({
  src,
  sizes,
  scrimClassName,
  preload = false,
}: BannerBackdropProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed || !isOptimizableImageSrc(src)) return null;

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        preload={preload}
        className="object-cover"
        onError={() => setFailed(true)}
      />
      <div className={cn("absolute inset-0", scrimClassName)} />
    </div>
  );
}
