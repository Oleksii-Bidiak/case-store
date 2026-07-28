"use client";

import { Menu, UserCircle } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/entities/session";
import { LogoutButton } from "@/features/admin-auth";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";

interface AdminHeaderProps {
  /** Reflected on the burger's `aria-expanded` for assistive tech. */
  mobileNavOpen: boolean;
  /** Opens the `<lg` mobile nav drawer (owned by `AdminShell`). */
  onOpenMobileNav: () => void;
}

/**
 * Admin header bar — a `<lg` burger that opens the mobile nav drawer, the panel
 * title, and the signed-in user's identity + account menu.
 *
 * The JWT carries only `{ sub, role }`, so the identity comes from the
 * AuthProvider's light `/api/users/me` profile fetch (TASK-255): the email when
 * available, falling back to a generic label before the fetch resolves or after
 * it fails.
 *
 * TASK-317: the identity is a menu rather than a bare label, because there was
 * previously no route to your own profile — and therefore no way to change your
 * own password from the admin panel at all. The role badge beside it matters
 * once there is more than one kind of staff: a manager should be able to tell at
 * a glance that they are looking at a deliberately narrower panel, not a broken
 * one.
 *
 * Global admin search is deferred to TASK-075 (Meilisearch, Tier-4);
 * the placeholder input from plan 025 has been removed.
 */
export function AdminHeader({
  mobileNavOpen,
  onOpenMobileNav,
}: AdminHeaderProps) {
  const { userId, email, isOwner, role } = useAuth();

  const roleLabel = isOwner
    ? dict.header.roleOwner
    : role === "MANAGER"
      ? dict.header.roleManager
      : null;

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

      <div className="flex shrink-0 items-center gap-2">
        {roleLabel && (
          <Badge
            variant={isOwner ? "default" : "secondary"}
            className="hidden sm:inline-flex"
          >
            {roleLabel}
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={dict.header.accountMenu}
              title={email ?? userId ?? undefined}
              className="gap-2"
            >
              <UserCircle className="size-5 text-muted-foreground" />
              <span className="hidden max-w-64 truncate sm:inline">
                {email ?? dict.header.adminLabel}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">
              {email ?? dict.header.adminLabel}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">{dict.header.profile}</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <LogoutButton />
      </div>
    </header>
  );
}
