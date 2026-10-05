import type { HTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Skeleton — animated placeholder block used as a loading fallback.
 * Pure markup; safe to render in Server or Client components.
 *
 * The default `rounded-md` goes through `cn`, so a caller's radius
 * (`rounded-card`, `rounded-lg`…) replaces it instead of racing it in the
 * cascade, where Tailwind v4's alphabetical utility order would decide.
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
