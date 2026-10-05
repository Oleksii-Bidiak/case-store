import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        sale: "bg-sale text-sale-foreground [a&]:hover:bg-sale/90",
        success: "bg-success text-success-foreground [a&]:hover:bg-success/90",
        warning: "bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        // Tinted pills (TASK-868). The tint and the `dot` carry the role colour;
        // the words stay `text-foreground`. Role-coloured text on its own 10–30%
        // tint is below 4.5:1 at `text-xs` with the current tokens (light:
        // success ≈3.0, destructive ≈3.3; dark: primary ≈3.9, destructive ≈3.7),
        // so the colour never paints the label. Foreground on any of these
        // tints is ≥ 9:1 in both themes.
        "tint-primary": "bg-primary/10 text-foreground",
        "tint-success": "bg-success/15 text-foreground",
        "tint-destructive": "bg-destructive/10 text-foreground",
        "tint-muted": "bg-muted text-foreground",
      },
      size: {
        default: "px-2 py-0.5",
        // The status pill of the order screens (mockups OrderConfirmation and
        // OrderStatus: 4px × 12px).
        pill: "px-3 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/**
 * Colour of the leading dot. A tinted pill gets the solid role colour, which is
 * ≥ 3:1 against the page and the card in both themes (WCAG 1.4.11 — the dot is
 * a graphic, the label is the text). Any other variant inherits its text colour.
 */
const DOT_COLOUR: Partial<Record<BadgeVariant, string>> = {
  "tint-primary": "bg-primary",
  "tint-success": "bg-success",
  "tint-destructive": "bg-destructive",
  "tint-muted": "bg-muted-foreground",
};

function Badge({
  className,
  variant,
  size,
  asChild = false,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** A small decorative dot in the variant's role colour before the label. */
    dot?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "span";
  const resolved: BadgeVariant = variant ?? "default";

  return (
    <Comp
      data-slot="badge"
      data-variant={resolved}
      className={cn(badgeVariants({ variant: resolved, size }), className)}
      {...props}
    >
      {/* Slot merges into ONE child, so a dot cannot ride along with asChild. */}
      {dot && !asChild ? (
        <>
          <span
            aria-hidden
            data-slot="badge-dot"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              DOT_COLOUR[resolved] ?? "bg-current",
            )}
          />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Badge, badgeVariants };
