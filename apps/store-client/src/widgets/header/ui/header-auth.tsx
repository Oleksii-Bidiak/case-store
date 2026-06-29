"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import { useAuth, useAuthControllerLogout } from "@/entities/session";
import {
  AccountDropdown,
  AccountDropdownItem,
  Button,
  Skeleton,
} from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * HeaderAuth — auth state area for the site header. Shows a skeleton while the
 * session is restoring, sign-in/register links for guests, and a user-icon
 * dropdown (account, orders, sign-out) for authenticated users.
 */
export function HeaderAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isInitializing, isAuthenticated, clearTokens } = useAuth();

  // Mirrors LogoutButton exactly: best-effort server logout, then clear local
  // session whether or not the server call succeeds.
  const logout = useAuthControllerLogout();
  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        clearTokens();
        queryClient.clear();
        router.push("/");
      },
    });
  };

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
    <AccountDropdown
      triggerContent={<User className="size-5" aria-hidden="true" />}
      triggerAria={dict.header.accountTriggerAria}
      menuAria={dict.header.accountMenuAria}
    >
      <AccountDropdownItem href="/account">
        {dict.header.myAccount}
      </AccountDropdownItem>
      <AccountDropdownItem href="/orders">
        {dict.account.ordersLink}
      </AccountDropdownItem>
      <li
        role="separator"
        aria-hidden="true"
        className="my-1 border-t border-border"
      />
      <AccountDropdownItem onClick={handleLogout} disabled={logout.isPending}>
        {logout.isPending
          ? dict.auth.logout.signingOut
          : dict.auth.logout.signOut}
      </AccountDropdownItem>
    </AccountDropdown>
  );
}
