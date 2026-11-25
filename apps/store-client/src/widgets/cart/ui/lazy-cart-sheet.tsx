"use client";

import type { ComponentProps } from "react";
import { lazyComponent, type LazyComponent } from "@/shared/lib/lazy-component";
// Type only: the sheet's code is reached through `import()` below.
import type { CartSheet } from "./cart-sheet";

/**
 * The mini-cart, loaded on demand (TASK-2524). It is closed on every first
 * paint, so its code (the sheet, the line rows, the add-on offers, the cleanup
 * action) stays out of the page's first-load JS.
 *
 * Hosts mount `<LazyCartSheet>` on the first open and keep it mounted, so the
 * close animation and Radix's focus handling run as before. They call
 * `preloadCartSheet()` on the trigger's intent (hover, focus, touch) and on
 * every open: if the code failed to load once, the next open retries.
 */
const lazyCartSheet = lazyComponent(() =>
  import("./cart-sheet").then((m) => m.CartSheet),
);

export const LazyCartSheet: LazyComponent<
  ComponentProps<typeof CartSheet>
>["Component"] = lazyCartSheet.Component;

export function preloadCartSheet(): void {
  void lazyCartSheet.load();
}
