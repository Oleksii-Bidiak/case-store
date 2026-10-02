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
 * The «Кабінет» action box, shared by the guest button and the signed-in menu
 * trigger so the two states are the same target: 44×44 icon-only below `xl`,
 * icon + caption from `xl` (TASK-511) — the box the skeleton reserves. The
 * signed-in trigger used to be AccountDropdown's own 36px icon button.
 */
const ACCOUNT_ACTION_CLASS =
  "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-foreground transition-colors hover:bg-accent hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Icon + caption; the caption is display:none below `xl`, so aria-label names it. */
const accountActionContent = (
  <>
    <User className="size-[22px]" aria-hidden="true" />
    <span className="hidden xl:inline">{dict.header.accountLabel}</span>
  </>
);

/**
 * HeaderAuth — auth-state area for the site header. Shows a skeleton while the
 * session is restoring, a "Кабінет" labelled trigger (opens the auth slide-out)
 * for guests, and a dropdown (account, orders, sign-out) behind the same-shaped
 * trigger for authenticated users.
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
    // Reserves the box the action settles into: 44×44 icon-only below `xl`,
    // icon + caption from `xl` (TASK-511) — no shift when the session resolves.
    return <Skeleton className="size-11 xl:h-13 xl:w-14" />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          aria-label={dict.header.accountOpenAria}
          className={ACCOUNT_ACTION_CLASS}
        >
          {accountActionContent}
        </button>
        <AuthSheet open={authOpen} onOpenChange={setAuthOpen} />
      </>
    );
  }

  return (
    <AccountDropdown
      triggerContent={accountActionContent}
      triggerClassName={ACCOUNT_ACTION_CLASS}
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
