"use client";

import { UserCircle } from "lucide-react";
import { useAuth } from "@/entities/session";
import { LogoutButton } from "@/features/admin-auth";
import { dict } from "@/shared/config";

/**
 * Admin header bar — the signed-in admin's identity and sign-out.
 *
 * The JWT carries only `{ sub, role }`, so the identity falls back to a generic
 * "Admin" label (with the user id as a tooltip). Showing the admin's email
 * would require a profile fetch — deferred per plan 025 §11.
 *
 * Global admin search is deferred to TASK-075 (Meilisearch, Tier-4);
 * the placeholder input from plan 025 has been removed.
 */
export function AdminHeader() {
  const { userId } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 shadow-card">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
          {dict.header.title}
        </h1>
      </div>

      <div className="flex items-center gap-4">
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
