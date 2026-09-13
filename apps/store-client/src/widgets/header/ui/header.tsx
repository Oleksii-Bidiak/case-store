"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, Tag } from "lucide-react";
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
import { dict } from "@/shared/config";
import type { BannerEntity } from "@/shared/api/generated/models";
import { SearchAutocomplete } from "@/features/search";
import { ThemeToggle } from "@/features/theme";
import { AnnouncementBar } from "./announcement-bar";
import { HeaderSearch } from "./header-search";
import { HeaderAuth } from "./header-auth";
import { HeaderCartBadge } from "./header-cart-badge";
import { HeaderWishlistBadge } from "./header-wishlist-badge";
import {
  HeaderMobileCategories,
  MOBILE_LINK_CLASS,
} from "./header-mobile-categories";

const NAV_LINKS = [
  { href: "/products", label: dict.nav.products },
  { href: "/blog", label: dict.nav.blog },
] as const;

interface HeaderProps {
  /** ANNOUNCEMENT_BAR banner from the server layout (falls back to dict copy). */
  announcement?: BannerEntity;
  /** Admin-uploaded store logo (SeoSettings.logoUrl) from the server layout. */
  logoUrl?: string | null;
}

/**
 * Header — sticky storefront header: a top announcement bar, a logo, the catalog
 * mega-menu trigger, the search box, a live action cluster (Акції / Обране /
 * Кабінет / Кошик), and a slide-out mobile menu (Sheet) that also lists the root
 * categories. Client component because it owns the mobile-menu open state and
 * composes hook-driven sub-widgets.
 *
 * The announcement banner and the store logo are fetched server-side (ISR) and
 * passed in as plain serializable props so the client header can render them
 * without its own fetch.
 */
export function Header({ announcement, logoUrl }: HeaderProps = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
      <AnnouncementBar banner={announcement} />
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3">
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
                  // `lg:hidden`, not `md:hidden` (TASK-413/TASK-504). Measured:
                  // the 768px row is 736px wide and the desktop cluster it
                  // would have to carry — brand 168 + search 163 + section
                  // links 117 + actions 402 + gaps 36 — is 886. Something has
                  // to give, and before this it was the brand: the logo was
                  // crushed to 8px. Keeping the slide-out menu to `lg` instead
                  // means the 768–1023 tablet band reaches the section links,
                  // «Акції», the theme switch and the account links through it,
                  // which is exactly the fallback TASK-504 asks for.
                  className="size-11 shrink-0 lg:hidden"
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
                <SheetHeader>
                  {/* The Sheet's accessible name — the wordmark (or the logo's
                      alt text) is the store name either way. */}
                  <SheetTitle>
                    <Logo logoUrl={logoUrl} />
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

                  {/* Catalog categories — tree accordion (TASK-082-B). */}
                  <HeaderMobileCategories
                    onNavigate={() => setMenuOpen(false)}
                  />

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
                          href="/orders"
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

                {/* Theme switch — a preference, not navigation, so it sits
                    below the menu and outside the <nav> landmark. Always
                    visible here: on a phone this is the only place it appears,
                    since the header cluster has no room for it. */}
                <div className="mt-2 border-t border-border px-2 pt-3 pb-4">
                  <ThemeToggle variant="full" />
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
              <Logo logoUrl={logoUrl} markClassName="shadow-elevated" />
            </Link>
          </div>

          {/* Search pill (Каталог + search + submit) — desktop. */}
          <HeaderSearch />

          {/* Section links — the desktop half of NAV_LINKS (TASK-413). They
              appear at exactly the width the slide-out menu that carries them
              disappears (`lg`), so the same two destinations are one gesture
              away at every size and this row costs a phone nothing. */}
          <nav
            aria-label={dict.nav.primaryAria}
            className="hidden shrink-0 items-center gap-1 lg:flex"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-3"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right: action cluster. `shrink-0` — these are the commerce actions,
              so they keep their size and the brand block absorbs the squeeze.
              Below 390px only the cart survives: Обране and Кабінет are hidden
              (both are in the slide-out menu above) rather than letting four
              targets collide on the narrowest phones. */}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            {/* Theme switch — leftmost, so the commerce actions stay grouped
                next to the cart.

                It appears at exactly `lg`, the width where the slide-out menu —
                the only other place it lives — disappears, so the two together
                cover every width with no gap. That is what TASK-504 caught
                behind the old `min-[1100px]`: the menu stopped at `md` and the
                switch only started at 1100, leaving 768–1099 with no way to
                change the theme at all. The threshold is measured, not guessed:
                at 1024 the row has 992px for brand 168 + search + links 133 +
                actions 402 + gaps 36, which leaves the search pill 253 — above
                its 165px floor, so nothing is squeezed. At 768 the same cluster
                needs 886 of 736 and the brand pays; hence the menu to `lg`. */}
            <ThemeToggle className="mr-1 hidden lg:flex" />
            <Link
              href="/promo"
              className="hidden min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-sale transition-colors hover:bg-sale/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              <Tag className="size-[22px]" aria-hidden="true" />
              {dict.header.promoLabel}
            </Link>
            <HeaderWishlistBadge className="hidden min-[390px]:flex" />
            <div className="hidden min-[390px]:block">
              <HeaderAuth />
            </div>
            <HeaderCartBadge className="ml-1" />
          </div>
        </div>
      </header>
    </>
  );
}
