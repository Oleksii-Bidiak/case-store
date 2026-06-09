"use client";

import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { Separator } from "@/shared/ui/separator";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Products", href: "#", icon: Package },
  { label: "Orders", href: "#", icon: ShoppingCart },
  { label: "Users", href: "#", icon: Users },
];

const bottomNavItems = [{ label: "Settings", href: "#", icon: Settings }];

/**
 * Admin sidebar navigation — placeholder with navigation structure.
 * Full implementation with active states and RBAC in Phase 4.
 */
export function AdminSidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 px-4">
        <Package className="size-6 text-primary" />
        <span className="text-lg font-bold text-foreground">MobileStore</span>
      </div>

      <Separator />

      {/* Main navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <Separator />

      {/* Bottom navigation */}
      <nav className="space-y-1 px-3 py-4">
        {bottomNavItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
