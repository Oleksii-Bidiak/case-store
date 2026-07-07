"use client";

import { Package } from "lucide-react";
import { Separator } from "@/shared/ui/separator";
import { AdminNavList } from "./admin-nav-list";

/**
 * Admin sidebar navigation rail. The nav items, active-route logic, and
 * TASK-248 count badges live in the shared `AdminNavList` (also rendered by the
 * mobile drawer), so the nav structure is defined exactly once.
 */
export function AdminSidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card shadow-card">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 px-4">
        <Package className="size-6 text-primary" />
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          MobileStore
        </span>
      </div>

      <Separator />

      <AdminNavList />
    </aside>
  );
}
