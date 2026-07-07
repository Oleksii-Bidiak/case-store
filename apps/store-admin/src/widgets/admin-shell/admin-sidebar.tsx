"use client";

import { Package } from "lucide-react";
import { Separator } from "@/shared/ui/separator";
import { AdminNavList } from "./admin-nav-list";

/**
 * AdminSidebar — the desktop-only navigation rail. Hidden below `lg`
 * (`display: none`, so it leaves both the layout and the accessibility tree);
 * on small screens the same nav body is reached through `MobileNavDrawer`
 * instead. The nav items, active-route logic, and TASK-248 count badges live in
 * the shared `AdminNavList`.
 */
export function AdminSidebar() {
  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-border bg-card shadow-card lg:flex">
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
