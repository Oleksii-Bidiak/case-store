import * as React from "react";

import { cn } from "@/shared/lib/utils";

/**
 * FieldError — the message under an invalid field (form canon 1.5, wave 198).
 *
 * Pair it with the field: `aria-invalid` on the control (red border + ring,
 * see `input.tsx`) and `aria-describedby={id}` pointing here, so the reason is
 * read with the field, not only shown under it. `role="alert"` announces it
 * the moment it appears — a submit that silently paints a border is a dead key
 * for a screen-reader user. Renders nothing without children.
 */
export function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"p"> & { id: string }) {
  if (children === null || children === undefined || children === false) {
    return null;
  }
  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-sm text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}
