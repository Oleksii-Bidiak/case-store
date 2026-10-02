"use client";

import * as React from "react";
import Link from "next/link";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

export interface AccountDropdownProps {
  /** Visual content of the trigger (e.g. an icon). The `<button>` is rendered internally. */
  triggerContent: React.ReactNode;
  /** `aria-label` for the icon-only trigger `<button>`. */
  triggerAria: string;
  /** `aria-label` for the `role="menu"` panel. */
  menuAria: string;
  /** `<AccountDropdownItem>` / `<AccountDropdownSeparator>` elements. */
  children: React.ReactNode;
  /** Extra classes for the wrapper around the trigger. */
  className?: string;
  /**
   * Extra classes for the trigger `<button>`, merged over the defaults via
   * `cn()` — e.g. to lay out an icon + caption the way sibling actions are.
   */
  triggerClassName?: string;
}

/** The items arrow keys can land on (Radix marks disabled ones `data-disabled`). */
const ENABLED_ITEM = '[role="menuitem"]:not([data-disabled])';

/** Everything the browser's Tab sequence can reach. */
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Move focus to the Tab-sequence neighbour of `from` (`1` next, `-1` previous).
 * The panel is portalled to the end of `<body>`, so a native Tab out of it
 * would land at the end of the page; this puts focus where Tab would have gone
 * from the trigger instead. Falls back to the trigger itself.
 */
function focusTabNeighbour(from: HTMLElement, direction: 1 | -1) {
  const tabbables = Array.from(
    document.querySelectorAll<HTMLElement>(TABBABLE),
  ).filter(
    (el) =>
      !el.closest("[data-radix-menu-content]") &&
      !el.closest("[inert]") &&
      !el.closest('[aria-hidden="true"]'),
  );
  const index = tabbables.indexOf(from);
  const target = index === -1 ? undefined : tabbables[index + direction];
  (target ?? from).focus();
}

/**
 * AccountDropdown — the header account "menu button" on Radix `DropdownMenu`
 * (TASK-503; it was a hand-rolled `absolute` panel).
 *
 * Radix brings what the hand-rolled panel lacked: the menu is portalled to
 * `<body>` (no `overflow` ancestor clips it), positioned with collision
 * detection (flips above / shifts inward near a viewport edge, 8px padding)
 * and capped at the available height with its own scroll, so on a short
 * window it no longer runs off the bottom edge. The look and the items are
 * unchanged — right-aligned under the trigger, 4px below it.
 *
 * Keyboard follows the WAI-ARIA APG menu button: Enter/Space/ArrowDown open
 * and focus the first item, ArrowUp opens and focuses the last; inside the
 * menu ArrowUp/ArrowDown cycle (wrapping, separators and disabled items
 * skipped), Home/End jump to the ends, a printable character moves by
 * typeahead, Escape closes and returns focus to the trigger. Tab/Shift+Tab
 * close the menu and move on to the trigger's Tab neighbour — Radix alone
 * would swallow Tab. A pointer open focuses the panel itself (Radix), so the
 * first item is not painted as highlighted under a mouse.
 *
 * `modal={false}`: the page keeps scrolling, and an outside click both closes
 * the menu and reaches its target, as with the old panel — no scroll lock, so
 * no scrollbar-compensation jump in the sticky header.
 */
export function AccountDropdown({
  triggerContent,
  triggerAria,
  menuAria,
  children,
  className,
  triggerClassName,
}: AccountDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // Opened with ArrowUp → focus the last item instead of the first.
  const focusLastRef = React.useRef(false);
  // Closed with Tab → focus the trigger's Tab neighbour instead of the trigger.
  const tabDirectionRef = React.useRef<1 | -1 | null>(null);

  // Radix's trigger handles Enter / Space / ArrowDown but not ArrowUp.
  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowUp" && !open) {
      event.preventDefault();
      focusLastRef.current = true;
      setOpen(true);
    }
  }

  // The mounted panel, as state: the effect below runs in the commit AFTER the
  // panel mounts, i.e. after Radix's own open-focus (which, for a keyboard
  // open, lands on the first item) — then it moves focus to the last one.
  // `DropdownMenu.Content` exposes no public hook for the open-focus itself.
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!content || !focusLastRef.current) return;
    focusLastRef.current = false;
    const items = content.querySelectorAll<HTMLElement>(ENABLED_ITEM);
    items[items.length - 1]?.focus();
  }, [content]);

  // Radix applies the available-height cap only once the panel is positioned,
  // i.e. after the open-focus already happened at full height — so on a short
  // window an ArrowUp open would leave «Вийти» focused but scrolled out of the
  // capped panel. Whenever the panel resizes, keep the focused item in view.
  React.useEffect(() => {
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const active = document.activeElement;
      const itemHasFocus =
        active instanceof HTMLElement &&
        active !== content &&
        content.contains(active);
      if (itemHasFocus) active.scrollIntoView({ block: "nearest" });
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);

  function handleContentKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    tabDirectionRef.current = event.shiftKey ? -1 : 1;
    setOpen(false);
  }

  function handleCloseAutoFocus(event: Event) {
    const direction = tabDirectionRef.current;
    tabDirectionRef.current = null;
    if (direction === null || !triggerRef.current) return;
    // Our preventDefault also skips Radix's own "focus the trigger" handler.
    event.preventDefault();
    focusTabNeighbour(triggerRef.current, direction);
  }

  return (
    <div className={cn("relative", className)}>
      <DropdownMenuPrimitive.Root
        open={open}
        onOpenChange={setOpen}
        modal={false}
      >
        <DropdownMenuPrimitive.Trigger
          ref={triggerRef}
          aria-label={triggerAria}
          onKeyDown={handleTriggerKeyDown}
          // min-h-11 min-w-11: a 44×44 touch target at minimum, while a
          // caption passed in `triggerContent` can still grow it.
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          {triggerContent}
        </DropdownMenuPrimitive.Trigger>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            aria-label={menuAria}
            // Radix names the menu after its trigger through aria-labelledby,
            // which would outrank aria-label; the menu keeps its own name.
            aria-labelledby={undefined}
            align="end"
            sideOffset={4}
            collisionPadding={8}
            loop
            ref={setContent}
            onCloseAutoFocus={handleCloseAutoFocus}
            onKeyDown={handleContentKeyDown}
            className="z-50 max-h-(--radix-dropdown-menu-content-available-height) max-w-(--radix-dropdown-menu-content-available-width) min-w-48 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-elevated outline-none"
          >
            {children}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </div>
  );
}

export interface AccountDropdownItemProps {
  /** Render a Next.js `<Link>` to this href; otherwise an action `<button>`. */
  href?: string;
  /** Action handler (fires before the menu closes). */
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * The old item surface; `data-highlighted` is the Radix state of the item that
 * holds focus (keyboard or pointer hover), so it paints the same `accent` fill
 * the old `focus-visible` did. `rounded-menu` is the menu-item role radius
 * (design-system §5).
 */
const ITEM_CLASS =
  "block w-full cursor-pointer rounded-menu px-3 py-2 text-left text-sm text-foreground outline-none transition-colors select-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground";

/**
 * AccountDropdownItem — a single `role="menuitem"` entry. Renders a Next.js
 * `<Link>` when `href` is supplied, otherwise a `<button type="button">`.
 * Selecting it (click, Enter or Space) runs `onClick`, closes the menu and
 * returns focus to the trigger. Must be rendered inside `AccountDropdown`.
 */
export function AccountDropdownItem({
  href,
  onClick,
  disabled = false,
  children,
}: AccountDropdownItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      asChild
      disabled={disabled}
      onSelect={onClick}
      className={ITEM_CLASS}
    >
      {href ? (
        <Link href={href}>{children}</Link>
      ) : (
        <button type="button" disabled={disabled}>
          {children}
        </button>
      )}
    </DropdownMenuPrimitive.Item>
  );
}

/** AccountDropdownSeparator — a `role="separator"` rule between item groups. */
export function AccountDropdownSeparator({
  className,
}: {
  className?: string;
}) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("my-1 border-t border-border", className)}
    />
  );
}
