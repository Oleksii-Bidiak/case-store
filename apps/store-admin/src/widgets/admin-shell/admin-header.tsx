"use client";

import { Search, UserCircle } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { useAuth } from "@/entities/session";
import { LogoutButton } from "@/features/admin-auth";

/**
 * Admin header bar — search, the signed-in admin's identity, and sign-out.
 *
 * The JWT carries only `{ sub, role }`, so the identity falls back to a generic
 * "Admin" label (with the user id as a tooltip). Showing the admin's email
 * would require a profile fetch — deferred per plan 025 §11.
 */
export function AdminHeader() {
  const { userId } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search..." className="w-64 pl-9" type="search" />
        </div>

        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-2 text-sm font-medium text-foreground"
            title={userId ?? undefined}
          >
            <UserCircle className="size-5 text-muted-foreground" />
            <span className="hidden sm:inline">Admin</span>
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
