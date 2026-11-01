import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "@/shared/lib/utils";
import { FOCUS_RING, PRESS, PRIMARY_STATES } from "@/shared/config";

// States follow docs/design-system.md §6 (TASK-2079): hover only on pointer
// devices (Tailwind v4 gates `hover:`), press = scale .98 — the only feedback
// on touch — focus = the house outline, disabled = tokens, never opacity.
const buttonVariants = cva(
  `inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-interactive ${FOCUS_RING} ${PRESS} disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground disabled:shadow-none disabled:active:scale-100 data-loading:cursor-progress data-loading:active:scale-100 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        // Loading keeps the graphite fill at rest — no hover lift while busy.
        default: `bg-primary text-primary-foreground ${PRIMARY_STATES} data-loading:hover:bg-primary data-loading:hover:shadow-none`,
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60",
        outline:
          "border-chip border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted active:bg-muted disabled:border-transparent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-foreground hover:bg-muted active:bg-foreground/10 disabled:bg-transparent",
        // A link does not press-scale: underline + 75 % instead.
        link: "text-foreground underline-offset-4 hover:underline active:scale-100 active:opacity-75 disabled:bg-transparent",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /**
     * Busy state (design-system §6 «Loading»): a 16px spinner before the
     * label, `aria-busy` + `aria-disabled`, clicks swallowed. Deliberately NOT
     * the native `disabled` — that would paint the grey disabled slab and drop
     * keyboard focus to <body> mid-action. Let the label say what is happening
     * («Додаємо…»). For `<button>` only: with `asChild` the spinner cannot be
     * injected into an arbitrary child, so it is ignored there.
     */
    loading?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const busy = loading && !asChild;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      {...props}
      data-loading={busy ? "" : undefined}
      aria-busy={busy || props["aria-busy"]}
      aria-disabled={busy || props["aria-disabled"]}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={
        busy
          ? (event: React.MouseEvent<HTMLButtonElement>) =>
              event.preventDefault()
          : onClick
      }
    >
      {busy ? (
        <>
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
