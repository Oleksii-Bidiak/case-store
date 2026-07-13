"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui";
import { AdminBrandMark } from "./admin-brand-mark";
import { AdminNavList } from "./admin-nav-list";

interface MobileNavDrawerProps {
  /** Whether the drawer is open (fully controlled). */
  open: boolean;
  /** Controlled open-state setter — Radix calls this for every close affordance. */
  onOpenChange: (open: boolean) => void;
}

/**
 * MobileNavDrawer — the `<lg` slide-out admin navigation. A fully-controlled
 * shadcn `Sheet` (`open`/`onOpenChange` props, no `SheetTrigger` — the burger in
 * `AdminHeader` toggles it) that renders the same `AdminNavList` as the desktop
 * rail. Focus trap, Esc-to-close, overlay-click, and focus-return are all handled
 * by the underlying Radix `Dialog` inside `shared/ui/sheet.tsx`.
 *
 * Closing on nav-link click is threaded through `AdminNavList`'s `onNavigate`
 * (TASK-204 pattern), mirroring the storefront header/cart drawers.
 */
export function MobileNavDrawer({ open, onOpenChange }: MobileNavDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* No SheetDescription is rendered — pass aria-describedby={undefined} so
          Radix does not emit its dev-only "Missing Description" warning. */}
      <SheetContent
        side="left"
        className="w-72 overflow-y-auto lg:hidden"
        aria-describedby={undefined}
      >
        {/* The brand mark lives INSIDE SheetTitle: with a logo uploaded the
            wordmark is an <img>, and Radix still needs the title to carry the
            drawer's accessible name (the <img> alt supplies it). */}
        <SheetHeader className="h-16 flex-row items-center gap-2">
          <SheetTitle className="flex flex-row items-center gap-2">
            <AdminBrandMark />
          </SheetTitle>
        </SheetHeader>

        <AdminNavList onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
