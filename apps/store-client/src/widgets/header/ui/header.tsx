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
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          {/* Left: mobile menu trigger + logo */}
          <div className="flex items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={dict.header.openMenu}
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              {/* No SheetDescription here — pass aria-describedby={undefined} so
                  Radix does not emit its "Missing Description" dev warning. */}
              <SheetContent
                side="left"
                className="w-72 overflow-y-auto"
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
              </SheetContent>
            </Sheet>

            <Link
              href="/"
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo logoUrl={logoUrl} markClassName="shadow-elevated" />
            </Link>
          </div>

          {/* Search pill (Каталог + search + submit) — desktop. */}
          <HeaderSearch />

          {/* Right: action cluster */}
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <Link
              href="/promo"
              className="hidden flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-sale transition-colors hover:bg-sale/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              <Tag className="size-[22px]" aria-hidden="true" />
              {dict.header.promoLabel}
            </Link>
            <HeaderWishlistBadge />
            <HeaderAuth />
            <HeaderCartBadge className="ml-1" />
          </div>
        </div>
      </header>
    </>
  );
}
