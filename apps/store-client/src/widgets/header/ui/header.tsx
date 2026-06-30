"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { useAuth, useAuthControllerLogout } from "@/entities/session";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { HeaderAuth } from "./header-auth";
import { HeaderCartBadge } from "./header-cart-badge";
import { HeaderWishlistBadge } from "./header-wishlist-badge";

const MOBILE_LINK_CLASS =
  "rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const NAV_LINKS = [{ href: "/products", label: dict.nav.products }] as const;

/**
 * Header — sticky storefront header with logo, desktop nav, a live cart badge,
 * the auth area, and a slide-out mobile menu (Sheet). Client component because
 * it owns the mobile-menu open state and composes hook-driven sub-widgets.
 */
export function Header() {
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
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
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
              className="w-72"
              aria-describedby={undefined}
            >
              <SheetHeader>
                <SheetTitle className="text-lg font-bold text-primary">
                  MobileStore
                </SheetTitle>
              </SheetHeader>
              <nav
                className="flex flex-col gap-1 px-2"
                aria-label={dict.header.menuTitle}
              >
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                ))}
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
            className="text-xl font-bold tracking-tight text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            MobileStore
          </Link>
        </div>

        {/* Center: desktop nav */}
        <nav
          className="hidden items-center gap-6 text-sm md:flex"
          aria-label={dict.nav.primaryAria}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-medium text-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right: wishlist + cart + auth */}
        <div className="flex items-center gap-2 sm:gap-3">
          <HeaderWishlistBadge />
          <HeaderCartBadge />
          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}
