"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/shared/lib/utils";

interface AccountDropdownContextValue {
  /** Close the panel and return focus to the trigger button. */
  closeMenu: () => void;
}

const AccountDropdownContext =
  React.createContext<AccountDropdownContextValue | null>(null);

export interface AccountDropdownProps {
  /** Visual content of the trigger (e.g. an icon). The `<button>` is rendered internally. */
  triggerContent: React.ReactNode;
  /** `aria-label` for the icon-only trigger `<button>`. */
  triggerAria: string;
  /** `aria-label` for the `role="menu"` panel. */
  menuAria: string;
  /** `<AccountDropdownItem>` elements (and optional `role="separator"` `<li>`s). */
  children: React.ReactNode;
  /** Optional id base for the panel (used to wire `aria-controls`). */
  id?: string;
  /** Extra classes for the positioning wrapper. */
  className?: string;
}

/**
 * AccountDropdown — a zero-dependency, WAI-ARIA "menu button" (disclosure).
 *
 * Mirrors the zero-dep pattern of `combobox.tsx`: React-only, no shadcn/Radix.
 * The trigger owns `aria-haspopup="menu"` / `aria-expanded` / `aria-controls`;
 * the panel is a `role="menu"` `<ul>` with `role="menuitem"` children whose focus
 * is managed programmatically (roving tabIndex via `.focus()`).
 *
 * Keyboard: Enter/Space/ArrowDown open + focus first item (ArrowUp focuses last);
 * ArrowUp/ArrowDown cycle items (wrapping); Home/End jump to ends; Escape closes
 * and returns focus to the trigger; Tab closes without stealing focus. Activating
 * an item closes the menu and returns focus to the trigger. A document `mousedown`
 * listener closes the panel on outside click.
 */
export function AccountDropdown({
  triggerContent,
  triggerAria,
  menuAria,
  children,
  id,
  className,
}: AccountDropdownProps) {
  const [open, setOpen] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLUListElement>(null);
  // Which item to focus once the panel mounts: "first" (default) or "last".
  const pendingFocusRef = React.useRef<"first" | "last">("first");

  const reactId = React.useId();
  const menuId = id ? `${id}-menu` : `account-dropdown-${reactId}`;

  /** Enabled, focusable menu items currently in the panel (skips separators/disabled). */
  const getItems = React.useCallback((): HTMLElement[] => {
    const menu = menuRef.current;
    if (!menu) return [];
    return Array.from(
      menu.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ),
    );
  }, []);

  const focusItemAt = React.useCallback(
    (index: number) => {
      const items = getItems();
      if (items.length === 0) return;
      const wrapped = ((index % items.length) + items.length) % items.length;
      items[wrapped]?.focus();
    },
    [getItems],
  );

  const openMenu = React.useCallback((focus: "first" | "last") => {
    pendingFocusRef.current = focus;
    setOpen(true);
  }, []);

  const closeMenu = React.useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // On open, move focus into the panel (first item, or last for ArrowUp).
  React.useEffect(() => {
    if (!open) return;
    if (pendingFocusRef.current === "last") {
      const items = getItems();
      items[items.length - 1]?.focus();
    } else {
      focusItemAt(0);
    }
  }, [open, focusItemAt, getItems]);

  // Close on outside click (no focus return — focus follows the pointer).
  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        event.preventDefault();
        openMenu("first");
        break;
      case "ArrowUp":
        event.preventDefault();
        openMenu("last");
        break;
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const items = getItems();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItemAt(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItemAt(currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItemAt(0);
        break;
      case "End":
        event.preventDefault();
        focusItemAt(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        // Let the browser move focus naturally; just dismiss the panel.
        setOpen(false);
        break;
    }
  }

  const contextValue = React.useMemo<AccountDropdownContextValue>(
    () => ({ closeMenu: () => closeMenu(true) }),
    [closeMenu],
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerAria}
        onClick={() => (open ? closeMenu(false) : openMenu("first"))}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {triggerContent}
      </button>

      {open && (
        <AccountDropdownContext.Provider value={contextValue}>
          <ul
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={menuAria}
            onKeyDown={handleMenuKeyDown}
            className="absolute top-full right-0 z-50 mt-1 min-w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-elevated"
          >
            {children}
          </ul>
        </AccountDropdownContext.Provider>
      )}
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
 * AccountDropdownItem — a single `role="menuitem"` entry. Renders a Next.js
 * `<Link>` when `href` is supplied, otherwise a `<button type="button">`.
 * Wrapped in a presentational `<li>` so the parent `<ul role="menu">` keeps a
 * valid list structure while the interactive element carries `role="menuitem"`.
 */
export function AccountDropdownItem({
  href,
  onClick,
  disabled = false,
  children,
}: AccountDropdownItemProps) {
  const ctx = React.useContext(AccountDropdownContext);

  const itemClass = cn(
    "block w-full rounded-md px-3 py-2 text-left text-sm text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
    disabled && "pointer-events-none opacity-50",
  );

  function activate() {
    if (disabled) return;
    onClick?.();
    ctx?.closeMenu();
  }

  if (href) {
    return (
      <li role="none">
        <Link
          href={href}
          role="menuitem"
          tabIndex={-1}
          aria-disabled={disabled || undefined}
          className={itemClass}
          onClick={activate}
        >
          {children}
        </Link>
      </li>
    );
  }

  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        className={itemClass}
        onClick={activate}
      >
        {children}
      </button>
    </li>
  );
}
