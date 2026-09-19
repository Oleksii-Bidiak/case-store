// design-sync shim for `next/link` — renders a plain anchor so storefront
// components that link (ProductCard, AccountDropdown) work outside Next.
import * as React from "react";

type NextHref = string | { pathname?: string };
type LinkProps = {
  href?: NextHref;
  children?: React.ReactNode;
  // Next-only props that must not leak onto the DOM <a>.
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export default function Link({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  ...props
}: LinkProps) {
  const h = typeof href === "string" ? href : (href?.pathname ?? "#");
  return (
    <a href={h} {...props}>
      {children}
    </a>
  );
}
