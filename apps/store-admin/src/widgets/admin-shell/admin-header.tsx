"use client";

import { useState } from "react";
import { BookOpen, LogOut, Menu, UserCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/entities/session";
import { LogoutButton, useLogout } from "@/features/admin-auth";
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
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { sessionRoleLabel } from "./model/session-role-label";
import { SectionHelpSheet } from "./section-help-sheet";

interface AdminHeaderProps {
  /** Reflected on the burger's `aria-expanded` for assistive tech. */
  mobileNavOpen: boolean;
  /** Opens the `<lg` mobile nav drawer (owned by `AdminShell`). */
  onOpenMobileNav: () => void;
}

/**
 * Admin header bar — a `<lg` burger that opens the mobile nav drawer, the panel
 * title, «Довідка розділу», the role badge, the account menu and sign-out.
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
 * Wave 198 (TASK-1034, AdminShell П1–П3, П8): the menu carries the role line
 * (visible on a phone, where the badge is not) and «Вийти»; the trigger lights
 * up on /profile, which is not a nav item and so had nothing lit at all. The
 * standalone sign-out button stays — the menu is a second door, not a move.
 * «Довідка розділу» opens a sheet for the current section; on a phone, where
 * the header has no room for the book icon, it lives in the account menu.
 */
export function AdminHeader({
  mobileNavOpen,
  onOpenMobileNav,
}: AdminHeaderProps) {
  const { userId, email, isOwner, isAdmin, role } = useAuth();
  const { logout, isPending: isSigningOut } = useLogout();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);

  const roleLabel = sessionRoleLabel({ isOwner, isAdmin, role });
  const onProfile = pathname === "/profile";
  const identity = email ?? dict.header.adminLabel;

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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label={dict.header.sectionHelp}
          title={dict.header.sectionHelp}
          aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}
        >
          <BookOpen className="size-5" />
        </Button>

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
              data-active={onProfile ? "true" : undefined}
              className={cn(
                "gap-2 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
                onProfile && "bg-accent text-accent-foreground",
              )}
            >
              <UserCircle className="size-5 text-muted-foreground" />
              <span className="hidden max-w-64 truncate sm:inline">
                {identity}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate">{identity}</span>
              {roleLabel && (
                <span className="text-xs font-normal text-muted-foreground">
                  {roleLabel}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                aria-current={onProfile ? "page" : undefined}
                className={cn(onProfile && "bg-accent text-accent-foreground")}
              >
                <UserCircle aria-hidden="true" />
                {dict.header.profile}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="sm:hidden"
              onSelect={() => setHelpOpen(true)}
            >
              <BookOpen aria-hidden="true" />
              {dict.header.sectionHelp}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isSigningOut} onSelect={logout}>
              <LogOut aria-hidden="true" />
              {dict.common.signOut}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <LogoutButton />
      </div>

      <SectionHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </header>
  );
}
