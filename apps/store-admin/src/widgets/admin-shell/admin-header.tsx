"use client";

import { Menu, UserCircle } from "lucide-react";
import { useAuth } from "@/entities/session";
import { LogoutButton } from "@/features/admin-auth";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

interface AdminHeaderProps {
  /** Reflected on the burger's `aria-expanded` for assistive tech. */
  mobileNavOpen: boolean;
  /** Opens the `<lg` mobile nav drawer (owned by `AdminShell`). */
  onOpenMobileNav: () => void;
}

/**
 * Admin header bar — a `<lg` burger that opens the mobile nav drawer, the panel
 * title, and the signed-in admin's identity + sign-out.
 *
 * The JWT carries only `{ sub, role }`, so the identity falls back to a generic
 * "Admin" label (with the user id as a tooltip). Showing the admin's email
 * would require a profile fetch — deferred per plan 025 §11.
 *
 * Global admin search is deferred to TASK-075 (Meilisearch, Tier-4);
 * the placeholder input from plan 025 has been removed.
 */
export function AdminHeader({
  mobileNavOpen,
  onOpenMobileNav,
}: AdminHeaderProps) {
  const { userId } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 shadow-card lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          aria-label={dict.header.openMenu}
          aria-expanded={mobileNavOpen}
          onClick={onOpenMobileNav}
        >
          <Menu className="size-5" />
        </Button>
        <h1 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">
          {dict.header.title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-2 text-sm font-medium text-foreground"
            title={userId ?? undefined}
          >
            <UserCircle className="size-5 text-muted-foreground" />
            <span className="hidden sm:inline">{dict.header.adminLabel}</span>
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
