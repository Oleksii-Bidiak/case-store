"use client";

import {
  LayoutDashboard,
  Package,
  Layers,
  Tag,
  FileText,
  ShoppingCart,
  Users,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const navItems = [
  { label: dict.nav.dashboard, href: "/", icon: LayoutDashboard },
  { label: dict.nav.products, href: "/products", icon: Package },
  { label: dict.nav.productGroups, href: "/product-groups", icon: Layers },
  { label: dict.nav.categories, href: "/categories", icon: Tag },
  { label: dict.nav.pages, href: "/pages", icon: FileText },
  { label: dict.nav.orders, href: "/orders", icon: ShoppingCart },
  { label: dict.nav.users, href: "/users", icon: Users },
];

const bottomNavItems = [
  { label: dict.nav.settings, href: "#", icon: Settings },
];

/**
 * Determine whether a nav item is the active route.
 * The dashboard ("/") matches exactly; section links match their sub-routes.
 */
function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "#") return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Admin sidebar navigation with active-route highlighting.
 */
export function AdminSidebar() {
  const pathname = usePathname();

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
            aria-current={
              isNavItemActive(pathname, item.href) ? "page" : undefined
            }
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
              isNavItemActive(pathname, item.href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
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
            aria-current={
              isNavItemActive(pathname, item.href) ? "page" : undefined
            }
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
              isNavItemActive(pathname, item.href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
