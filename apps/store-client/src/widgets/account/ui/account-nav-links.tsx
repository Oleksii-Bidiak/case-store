"use client";

import { Suspense, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { AccountIcon } from "./account-icons";
import {
  ACCOUNT_NAV,
  activeAccountNavKey,
  type AccountNavKey,
} from "./account-nav";

const d = dict.account.dashboard;

/**
 * The active entry is derived from the URL — pathname plus `?section=` — so a
 * reload, a shared link and Back all keep it (TASK-867).
 *
 * `useSearchParams` is read inside a `<Suspense>` of its own: `/account` is
 * prerendered, and a bare call would push the whole account shell into
 * client-side rendering. The fallback is the same menu keyed by the pathname
 * alone, so it never renders a different number of items.
 */
function useActiveKeyFromUrl(): AccountNavKey | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return activeAccountNavKey(pathname, searchParams.get("section"));
}

function usePathnameOnlyKey(): AccountNavKey | null {
  return activeAccountNavKey(usePathname(), null);
}

/* ── Sidebar (lg+) ────────────────────────────────────────────────────── */

function SidebarList({ activeKey }: { activeKey: AccountNavKey | null }) {
  return (
    <nav aria-label={d.navAria} className="flex flex-col">
      {ACCOUNT_NAV.map((entry) => {
        const active = entry.key === activeKey;
        return (
          <Link
            key={entry.key}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 11px + a 20px line + 11px = the skeleton's 42px `h-10.5` row.
              "relative mb-0.5 flex w-full items-center gap-3 rounded-menu px-3.5 py-2.75 text-left text-sm no-underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // Active tint is a token utility over the card (TASK-879).
              active
                ? "bg-primary/10 font-semibold text-primary"
                : "font-medium text-foreground hover:bg-muted",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-2.25 bottom-2.25 left-0 w-0.75 rounded-full bg-primary"
              />
            )}
            <AccountIcon
              name={entry.icon}
              width={20}
              height={20}
              className={active ? "text-primary" : "text-muted-foreground"}
            />
            <span className="flex-1">{d.nav[entry.key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFromUrl() {
  return <SidebarList activeKey={useActiveKeyFromUrl()} />;
}

function SidebarFallback() {
  return <SidebarList activeKey={usePathnameOnlyKey()} />;
}

/** The menu inside the 264px sidebar card (shown from `lg`). */
export function AccountSidebarNav() {
  return (
    <Suspense fallback={<SidebarFallback />}>
      <SidebarFromUrl />
    </Suspense>
  );
}

/* ── Chip strip (below lg) ────────────────────────────────────────────── */

/**
 * Chips are 44px, not the mockup's 40: this strip is the only way between
 * account sections on a phone, and design-system §8 asks 44×44 of every touch
 * target (the /categories strip has the same `h-11` chip).
 */
const CHIP =
  "inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border-chip px-4 text-sm font-semibold no-underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const CHIP_ACTIVE = "border-primary bg-primary text-primary-foreground";
const CHIP_IDLE =
  "border-border bg-card text-foreground hover:border-primary/40";

function StripList({ activeKey }: { activeKey: AccountNavKey | null }) {
  const stripRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // A section further along the strip (e.g. «Налаштування») would otherwise
  // be out of view on arrival. Scroll the strip — not the page — so its chip
  // is visible: `scrollIntoView` would also move the window vertically.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const chip = activeRef.current;
    if (!strip || !chip) return;
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    if (
      left < strip.scrollLeft ||
      right > strip.scrollLeft + strip.clientWidth
    ) {
      const pad = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
      strip.scrollLeft = left - pad;
    }
  }, [activeKey]);

  return (
    <nav
      ref={stripRef}
      aria-label={d.navAria}
      data-testid="account-strip"
      // Bleeds to the screen edge (the container's px-4 / sm:px-6) so the
      // half-clipped last chip reads as "scrolls". `relative` makes the strip
      // its chips' offsetParent; `py-1` keeps the focus ring off the clip edge
      // and `-mt-1` gives the 4px back to the line above.
      className="relative -mx-4 -mt-1 mb-5 flex scrollbar-none gap-2 overflow-x-auto px-4 py-1 sm:-mx-6 sm:px-6 lg:hidden"
    >
      {ACCOUNT_NAV.map((entry) => {
        const active = entry.key === activeKey;
        return (
          <Link
            key={entry.key}
            ref={active ? activeRef : undefined}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={cn(CHIP, active ? CHIP_ACTIVE : CHIP_IDLE)}
          >
            {d.nav[entry.key]}
          </Link>
        );
      })}
    </nav>
  );
}

function StripFromUrl() {
  return <StripList activeKey={useActiveKeyFromUrl()} />;
}

function StripFallback() {
  return <StripList activeKey={usePathnameOnlyKey()} />;
}

/**
 * The account sections as a horizontally scrolling row of chips, in place of
 * the sidebar card below `lg` (AccountOrders.dc.html `.ao-strip`). «Вихід» is
 * not a chip — the mockup leaves it out, and the header's account menu already
 * carries sign-out on every screen size.
 */
export function AccountSectionStrip() {
  return (
    <Suspense fallback={<StripFallback />}>
      <StripFromUrl />
    </Suspense>
  );
}
