"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toaster — the single storefront notification surface (sonner). Styled to the
 * design import: a bottom-centre, dark toast (foreground surface / background
 * text, inverted per theme) with a coloured status icon and a soft lift shadow.
 * All notifications (add-to-cart, wishlist, auth, errors) go through `toast()`.
 *
 * `clearMobileBar` (TASK-1771) — set on the app-wide toaster only — binds the
 * bottom offsets to `--toast-offset-bottom` / `--toast-mobile-offset-bottom`
 * (globals.css), which grow by the height of a mounted fixed bottom bar below
 * `md`. Without it a phone toast covers the bar's primary action. A toaster
 * inside an overlay (the cart sheet's) leaves it off: the bar is behind the
 * overlay there, and lifting would only float the toast for nothing.
 */
const MOBILE_BAR_CLEAR_OFFSET: ToasterProps["offset"] = {
  bottom: "var(--toast-offset-bottom)",
};
const MOBILE_BAR_CLEAR_MOBILE_OFFSET: ToasterProps["mobileOffset"] = {
  bottom: "var(--toast-mobile-offset-bottom)",
};

interface StoreToasterProps extends ToasterProps {
  /** Stack above a fixed bottom bar (MobilePayBar / MobileAtcBar) below `md`. */
  clearMobileBar?: boolean;
}

const Toaster = ({ clearMobileBar = false, ...props }: StoreToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-center"
      offset={clearMobileBar ? MOBILE_BAR_CLEAR_OFFSET : undefined}
      mobileOffset={clearMobileBar ? MOBILE_BAR_CLEAR_MOBILE_OFFSET : undefined}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-foreground)",
          "--normal-text": "var(--color-background)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
