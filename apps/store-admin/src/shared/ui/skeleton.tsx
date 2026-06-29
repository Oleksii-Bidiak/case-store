import type { HTMLAttributes } from "react";

/**
 * Skeleton — animated placeholder block used as a loading fallback.
 * Pure markup; safe to render in Server or Client components.
 */
export function Skeleton({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`animate-pulse rounded-md bg-muted ${className}`}
      {...props}
    />
  );
}
