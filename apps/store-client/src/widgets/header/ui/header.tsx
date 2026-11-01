"use client";

import { useRef, useState, type ReactNode } from "react";
import { useHeaderHeight } from "@/shared/lib/use-header-height";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, PackageSearch, Tag } from "lucide-react";
import { useAuth, useAuthControllerLogout } from "@/entities/session";
import {
  Button,
  Logo,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui";
import { dict, PAGE_CONTAINER } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import type { BannerEntity } from "@/shared/api/generated/models";
import { DevicePicker } from "@/features/device-picker";
import { DeviceBar } from "@/widgets/device-bar";
import { SearchAutocomplete } from "@/features/search";
import { ThemeSwitchRow, ThemeToggleButton } from "@/features/theme";
import { AnnouncementBar } from "./announcement-bar";
import { HeaderSearch, type CatalogMenuSlotProps } from "./header-search";
import { ACCOUNT_ACTION_CLASS, HeaderAuth } from "./header-auth";
import { HeaderCartBadge } from "./header-cart-badge";
import { HeaderWishlistBadge } from "./header-wishlist-badge";

/** Shared styling for the links in the slide-out menu. */
const MOBILE_LINK_CLASS =
  "rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** What the header hands the sheet's catalog (TASK-2072). */
export interface CatalogDrillSlotProps {
  /** Close the slide-out menu (a link was picked, or the picker opens). */
  onNavigate: () => void;
}

const NAV_LINKS = [
  { href: "/products", label: dict.nav.products },
  { href: "/blog", label: dict.nav.blog },
] as const;

interface HeaderProps {
  /** ANNOUNCEMENT_BAR banner from the server layout (falls back to dict copy). */
  announcement?: BannerEntity;
  /** Admin-uploaded store logo (SeoSettings.logoUrl) from the server layout. */
  logoUrl?: string | null;
  /**
   * Store display name (SeoSettings.siteName via `resolveSiteName`) from the
   * server layout — the wordmark and the logo's alt (TASK-546).
   */
  siteName: string;
  /**
   * Support phone (SiteContactSettings.phone) from the server layout — the
   * announcement bar hides it when unset (TASK-873).
   */
  supportPhone?: string | null;
  /**
   * The «Каталог» mega menu's content (lg+) and the sheet's step-by-step
   * catalog (TASK-2072). Slots, not imports: both live in
   * `widgets/catalog-menu`, and widgets do not import each other — the app
   * layer composes them (`app/site-header.tsx`).
   */
  renderCatalogMenu?: (props: CatalogMenuSlotProps) => ReactNode;
  renderCatalogDrill?: (props: CatalogDrillSlotProps) => ReactNode;
}

/**
 * Header — sticky storefront header: a top announcement bar, a logo, the catalog
 * mega-menu trigger, the search box, a live action cluster (Акції / Обране /
 * Кабінет / Кошик), and a slide-out mobile menu (Sheet) that also lists the root
 * categories. Client component because it owns the mobile-menu open state and
 * composes hook-driven sub-widgets.
 *
 * The announcement banner, the store logo, the store name and the support phone
 * are fetched server-side (ISR) and passed in as plain serializable props so
 * the client header can render them without its own fetch.
 */
export function Header({
  announcement,
  logoUrl,
  siteName,
  supportPhone,
  renderCatalogMenu,
  renderCatalogDrill,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Publishes the measured height for every sticky panel below (layout.ts).
  const headerRef = useRef<HTMLElement>(null);
  useHeaderHeight(headerRef);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isInitializing, isAuthenticated, clearTokens } = useAuth();

  // Mirrors LogoutButton / HeaderAuth: best-effort server logout, then clear the
  // local session and close the slide-out menu regardless of the outcome.
  const logout = useAuthControllerLogout();
  const handleMobileLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        clearTokens();
        queryClient.clear();
        setMenuOpen(false);
        router.push("/");
      },
    });
  };

  return (
    <>
      <AnnouncementBar banner={announcement} phone={supportPhone} />
      <header
        ref={headerRef}
        data-site-header=""
        className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
      >
        {/* `relative`: the «Каталог» panel anchors to this row (TASK-2072),
            so its left edge lines up with the logo at every width. */}
        <div
          className={`${PAGE_CONTAINER} relative flex h-16 items-center gap-2 sm:gap-3`}
        >
          {/* Left: mobile menu trigger + logo. `min-w-0` (here and on the logo
              link) makes this the cluster that yields on a 320px screen — the
              wordmark truncates instead of pushing the cart off-canvas. */}
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  // size-11 (44px): this is the only navigation control on a
                  // phone, so it gets a full touch target; `shrink-0` keeps it
                  // at that size when the row runs out of width.
                  //
                  // `xl:hidden` (TASK-511/512, after TASK-413/504's `lg`).
                  // Measured: even with icon-only actions the 768px row (736)
                  // cannot carry brand 168 + pill 159 + section links 117 +
                  // actions 262 + gaps; and at 1024 (992) the section links and
                  // the theme switch would leave the search input ~79px — the
                  // placeholder cut to «Пошук». So until `xl` the slide-out
                  // menu carries Товари/Блог and the theme switch, and the row
                  // spends its width on the search input (≈317px at 1024).
                  className="size-11 shrink-0 xl:hidden"
                  aria-label={dict.header.openMenu}
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              {/* No SheetDescription here — pass aria-describedby={undefined} so
                  Radix does not emit its "Missing Description" dev warning. */}
              <SheetContent
                side="left"
                // max-h-dvh + overscroll-contain: the panel keeps its own
                // scrolling to itself (no scroll-chaining to the page behind it
                // on iOS) and never grows past the visible viewport when the
                // mobile browser chrome is showing.
                className="max-h-dvh w-72 max-w-full overflow-y-auto overscroll-contain"
                aria-describedby={undefined}
              >
                <SheetHeader className="pr-16">
                  {/* The Sheet's accessible name — the wordmark (or the logo's
                      alt text) is the store name either way. */}
                  <SheetTitle>
                    <Logo siteName={siteName} logoUrl={logoUrl} />
                  </SheetTitle>
                </SheetHeader>
                {/* Mobile search — full width at the top of the slide-out menu. */}
                <div className="px-2 pb-2">
                  <SearchAutocomplete
                    id="mobile-search"
                    onNavigate={() => setMenuOpen(false)}
                  />
                </div>
                <nav
                  className="flex flex-col gap-1 px-2"
                  aria-label={dict.header.menuTitle}
                >
                  {NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className={MOBILE_LINK_CLASS}
                    >
                      {link.label}
                    </Link>
                  ))}
                  <Link
                    href="/promo"
                    onClick={() => setMenuOpen(false)}
                    className={`${MOBILE_LINK_CLASS} inline-flex items-center gap-2 text-sale`}
                  >
                    <Tag className="size-[18px]" aria-hidden="true" />
                    {dict.header.promoLabel}
                  </Link>
                  <Link
                    href="/cart"
                    onClick={() => setMenuOpen(false)}
                    className={MOBILE_LINK_CLASS}
                  >
                    {dict.nav.cart}
                  </Link>
                  <Link
                    href="/wishlist"
                    onClick={() => setMenuOpen(false)}
                    className={MOBILE_LINK_CLASS}
                  >
                    {dict.wishlist.navLabel}
                  </Link>

                  {/* The step-by-step catalog (TASK-2072): device row, roots,
                      and in place down to level 4. Inline, not a nested
                      dialog — Escape keeps closing the sheet. */}
                  {renderCatalogDrill && (
                    <>
                      <hr className="my-1 border-border" />
                      {renderCatalogDrill({
                        onNavigate: () => setMenuOpen(false),
                      })}
                    </>
                  )}

                  {/* Auth area — hidden until the session bootstrap settles. */}
                  {!isInitializing &&
                    (isAuthenticated ? (
                      <>
                        <hr className="my-1 border-border" />
                        <Link
                          href="/account"
                          onClick={() => setMenuOpen(false)}
                          className={MOBILE_LINK_CLASS}
                        >
                          {dict.header.myAccount}
                        </Link>
                        <Link
                          href="/account/orders"
                          onClick={() => setMenuOpen(false)}
                          className={MOBILE_LINK_CLASS}
                        >
                          {dict.account.ordersLink}
                        </Link>
                        <hr className="my-1 border-border" />
                        <button
                          type="button"
                          onClick={handleMobileLogout}
                          disabled={logout.isPending}
                          className={`${MOBILE_LINK_CLASS} text-left disabled:opacity-50`}
                        >
                          {logout.isPending
                            ? dict.auth.logout.signingOut
                            : dict.auth.logout.signOut}
                        </button>
                      </>
                    ) : (
                      <>
                        <hr className="my-1 border-border" />
                        {/* TASK-1999: a guest's «Мої замовлення» — the lookup
                            by number. A signed-in shopper has the real one. */}
                        <Link
                          href="/orders/status"
                          onClick={() => setMenuOpen(false)}
                          className={MOBILE_LINK_CLASS}
                        >
                          {dict.header.orderStatusLink}
                        </Link>
                        <Link
                          href="/login"
                          onClick={() => setMenuOpen(false)}
                          className={MOBILE_LINK_CLASS}
                        >
                          {dict.header.signIn}
                        </Link>
                        <Link
                          href="/register"
                          onClick={() => setMenuOpen(false)}
                          className={MOBILE_LINK_CLASS}
                        >
                          {dict.header.register}
                        </Link>
                      </>
                    ))}
                </nav>

                {/* «Темна тема» switch (TASK-2073) — a preference, not
                    navigation, so it sits below the menu and outside the <nav>
                    landmark. Always visible here: below `xl` this is the only
                    place it appears, since the header row has no room for it
                    (TASK-511/512). «Системна» lives in the account card. */}
                <div className="mt-2 border-t border-border px-2 pt-3 pb-4">
                  <ThemeSwitchRow />
                </div>
              </SheetContent>
            </Sheet>

            <Link
              href="/"
              // `flex min-w-0` (not just min-w-0): the Logo is an inline-flex
              // box, so only as a flex CHILD of a shrinkable link does it
              // actually give way and let its wordmark truncate.
              className="flex min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo
                siteName={siteName}
                logoUrl={logoUrl}
                markClassName="shadow-elevated"
              />
            </Link>
          </div>

          {/* Search pill (Каталог + search + submit) — desktop. Below `lg`
              its «Каталог» opens this menu sheet (TASK-2072). */}
          <HeaderSearch
            renderCatalogMenu={renderCatalogMenu}
            onOpenMenu={() => setMenuOpen(true)}
          />

          {/* Section links — the desktop half of NAV_LINKS (TASK-413). They
              appear at exactly the width the slide-out menu that carries them
              disappears (`xl`, TASK-511/512), so the same two destinations are
              one gesture away at every size and the row below `xl` keeps its
              width for the search input. */}
          <nav
            aria-label={dict.nav.primaryAria}
            className="hidden shrink-0 items-center gap-1 xl:flex"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right: action cluster. `shrink-0` — these are the commerce actions,
              so they keep their size and the brand block absorbs the squeeze.
              Below `xl` Акції / Обране / Кабінет are icons only (≈262px for the
              cluster instead of 402), captions from `xl` (TASK-511).
              Below 390px only the cart survives: Обране and Кабінет are hidden
              (both are in the slide-out menu above) rather than letting four
              targets collide on the narrowest phones.

              Phone spacing is tighter (`gap-0.5`, cart `ml-0`) because the 44×44
              Обране / Кабінет targets cost the row 6px at 390 — measured, the
              wordmark was cut to «CaseSt…» (100/103). Each icon already carries
              11px of padding either side, so the glyphs stay 24px apart. */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            {/* Theme button — leftmost, so the commerce actions stay grouped
                next to the cart. One 44px button with the effective theme's
                icon (TASK-2073): the old three-segment pill cost 130px and
                left the search input under 240px at 1280 (TASK-2286).

                It appears at exactly `xl`, the width where the slide-out menu —
                the only other place it lives — disappears, so the two together
                cover every width with no gap (TASK-504 caught the old
                `min-[1100px]` gap). It waits for `xl`, not `lg`, because at
                1024 it and the section links cost the search input everything
                but ~79px (TASK-512); in the menu they cost the row nothing. */}
            <ThemeToggleButton className="mr-1 hidden xl:inline-flex" />
            {/* Icon-only below `xl` (TASK-511): the caption is display:none
                there and so drops out of the accessible name — the aria-label
                carries it. 44×44 minimum either way. */}
            <Link
              href="/promo"
              aria-label={dict.header.promoLabel}
              className="hidden min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-sale transition-colors hover:bg-sale/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              <Tag className="size-[22px]" aria-hidden="true" />
              <span className="hidden xl:inline">{dict.header.promoLabel}</span>
            </Link>
            <HeaderWishlistBadge className="hidden min-[390px]:flex" />
            {/* «Статус замовлення» for guests (TASK-1999) — until now only the
                footer led there. From exactly `xl`, where the slide-out menu
                that carries it below `xl` disappears; a signed-in shopper has
                «Мої замовлення» under Кабінет instead.
                While the session restores, an invisible twin holds its box, as
                HeaderAuth's skeleton does: the theme switch is this cluster's
                leftmost item, so an action that only appeared once auth settled
                slid it left under a guest's cursor. */}
            {isInitializing && (
              <span
                aria-hidden="true"
                data-slot="order-status-placeholder"
                className={cn(ACCOUNT_ACTION_CLASS, "invisible hidden xl:flex")}
              >
                <PackageSearch className="size-5.5" />
                <span>{dict.header.orderStatusCaption}</span>
              </span>
            )}
            {!isInitializing && !isAuthenticated && (
              <Link
                href="/orders/status"
                aria-label={dict.header.orderStatusLink}
                className={cn(ACCOUNT_ACTION_CLASS, "hidden xl:flex")}
              >
                <PackageSearch className="size-5.5" aria-hidden="true" />
                <span>{dict.header.orderStatusCaption}</span>
              </Link>
            )}
            <div className="hidden min-[390px]:block">
              <HeaderAuth />
            </div>
            <HeaderCartBadge className="sm:ml-1" />
          </div>
        </div>
        {/* «Мої пристрої» (TASK-2074) — the second row, sticky with the
            header at every width: the active device chip and the others,
            and from 1024 the active device's categories. Client-only data
            (localStorage), so tier 1 renders a placeholder of its exact
            height until hydration and does not shift the page below it. */}
        <DeviceBar />
      </header>
      {/* The ONE device picker (TASK-2070). The header is on every page, so
          every entry point — chip, homepage picker, PDP compat row, /devices,
          search — opens this instance via `openDevicePicker()`. Renders
          nothing until opened; the model list is fetched on first open. */}
      <DevicePicker />
    </>
  );
}
