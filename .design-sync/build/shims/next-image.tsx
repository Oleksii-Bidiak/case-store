// design-sync shim for `next/image` — renders a plain <img>. Not currently
// imported by store-client/shared/ui (ProductCard uses a raw <img>), but
// aliased defensively so any future next/image usage still bundles.
import * as React from "react";

type NextSrc = string | { src?: string };
type ImageProps = {
  src?: NextSrc;
  alt?: string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  loader?: unknown;
  placeholder?: string;
  blurDataURL?: string;
  unoptimized?: boolean;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src">;

export default function Image({
  src,
  alt = "",
  fill,
  priority: _priority,
  quality: _quality,
  loader: _loader,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  unoptimized: _unoptimized,
  style,
  ...props
}: ImageProps) {
  const s = typeof src === "string" ? src : (src?.src ?? "");
  const fillStyle: React.CSSProperties | undefined = fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
      }
    : undefined;
  return (
    <img src={s} alt={alt} style={{ ...fillStyle, ...style }} {...props} />
  );
}
