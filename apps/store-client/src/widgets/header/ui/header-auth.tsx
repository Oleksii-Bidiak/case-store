"use client";

import Link from "next/link";
import { useAuth } from "@/entities/session";
import { LogoutButton } from "@/features/auth";
import { Button, Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * HeaderAuth — auth state area for the site header. Shows a skeleton while the
 * session is restoring, sign-in/register links for guests, and an account
 * label + sign-out for authenticated users.
 */
export function HeaderAuth() {
  const { isInitializing, isAuthenticated } = useAuth();

  if (isInitializing) {
    return <Skeleton className="h-8 w-32" />;
  }

  if (!isAuthenticated) {
    return (
      <nav
        className="flex items-center gap-2 text-sm sm:gap-3"
        aria-label={dict.nav.accountAria}
      >
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">{dict.header.signIn}</Link>
        </Button>
        <Button size="sm" asChild className="hidden sm:inline-flex">
          <Link href="/register">{dict.header.register}</Link>
        </Button>
      </nav>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm sm:gap-3">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/account">{dict.header.myAccount}</Link>
      </Button>
      <LogoutButton />
    </div>
  );
}
