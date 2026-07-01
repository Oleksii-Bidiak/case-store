"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import { useAuth, useAuthControllerLogout } from "@/entities/session";
import { AuthSheet } from "@/features/auth";
import { AccountDropdown, AccountDropdownItem, Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * HeaderAuth — auth-state area for the site header. Shows a skeleton while the
 * session is restoring, a "Кабінет" labelled trigger (opens the auth slide-out)
 * for guests, and a user-icon dropdown (account, orders, sign-out) for
 * authenticated users.
 */
export function HeaderAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isInitializing, isAuthenticated, clearTokens } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

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
    return <Skeleton className="h-9 w-9 sm:w-14" />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          aria-label={dict.header.accountOpenAria}
          className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-foreground transition-colors hover:bg-accent hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <User className="size-[22px]" aria-hidden="true" />
          <span className="hidden sm:inline">{dict.header.accountLabel}</span>
        </button>
        <AuthSheet open={authOpen} onOpenChange={setAuthOpen} />
      </>
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
