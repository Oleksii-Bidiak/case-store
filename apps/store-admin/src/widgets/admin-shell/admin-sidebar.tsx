"use client";

import {
  LayoutDashboard,
  Package,
  Layers,
  Tag,
  Award,
  Smartphone,
  Ticket,
  FileText,
  Newspaper,
  ImageIcon,
  ShoppingCart,
  Star,
  MessageSquare,
  Users,
  Mail,
  Phone,
  Search,
  HelpCircle,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminContactUnreadCount } from "@/entities/contact";
import { useAdminDashboardControllerGetNeedsAction } from "@/entities/dashboard";
import { Badge } from "@/shared/ui";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const navItems = [
  { label: dict.nav.dashboard, href: "/", icon: LayoutDashboard },
  { label: dict.nav.products, href: "/products", icon: Package },
  { label: dict.nav.productGroups, href: "/product-groups", icon: Layers },
  { label: dict.nav.categories, href: "/categories", icon: Tag },
  { label: dict.nav.brands, href: "/brands", icon: Award },
  { label: dict.nav.devices, href: "/devices/brands", icon: Smartphone },
  { label: dict.nav.discounts, href: "/discounts", icon: Ticket },
  { label: dict.nav.pages, href: "/pages", icon: FileText },
  { label: dict.nav.blog, href: "/blog", icon: Newspaper },
  { label: dict.nav.banners, href: "/banners", icon: ImageIcon },
  { label: dict.nav.orders, href: "/orders", icon: ShoppingCart },
  { label: dict.nav.reviews, href: "/reviews", icon: Star },
  { label: dict.nav.messages, href: "/messages", icon: MessageSquare },
  { label: dict.nav.users, href: "/users", icon: Users },
  { label: dict.nav.subscribers, href: "/subscribers", icon: Mail },
];

const bottomNavItems = [
  { label: dict.nav.siteContact, href: "/settings/contact", icon: Phone },
  { label: dict.nav.seoSettings, href: "/settings/seo", icon: Search },
  { label: dict.nav.faq, href: "/faq", icon: HelpCircle },
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
  // Unread (NEW) contact-message count for the sidebar badge. Refetches on
  // window focus so the badge stays roughly current as messages arrive.
  const { data: unreadData } = useAdminContactUnreadCount();
  const unread = unreadData?.data?.unread ?? 0;

  // Needs-action counters (TASK-248) — same shared query key the dashboard
  // widget reads, so both refetch from one cache entry. Drives the count badges
  // next to «Замовлення» (new orders) and «Відгуки» (reviews awaiting moderation).
  const { data: needsActionData } = useAdminDashboardControllerGetNeedsAction();
  const newOrders = needsActionData?.data?.newOrders ?? 0;
  const pendingReviews = needsActionData?.data?.pendingReviews ?? 0;

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

      {/* Main navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                active
                  ? "bg-primary text-primary-foreground shadow-card"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
              {item.href === "/messages" && unread > 0 && (
                <Badge
                  variant={active ? "secondary" : "default"}
                  aria-label={dict.messages.unreadBadgeAria(unread)}
                  className="ml-auto"
                >
                  {unread}
                </Badge>
              )}
              {item.href === "/orders" && newOrders > 0 && (
                <Badge
                  variant={active ? "secondary" : "default"}
                  aria-label={dict.dashboard.newOrdersBadgeAria(newOrders)}
                  className="ml-auto"
                >
                  {newOrders}
                </Badge>
              )}
              {item.href === "/reviews" && pendingReviews > 0 && (
                <Badge
                  variant={active ? "secondary" : "default"}
                  aria-label={dict.dashboard.pendingReviewsBadgeAria(
                    pendingReviews,
                  )}
                  className="ml-auto"
                >
                  {pendingReviews}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Bottom navigation */}
      <nav className="space-y-1 px-3 py-4">
        {bottomNavItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                active
                  ? "bg-primary text-primary-foreground shadow-card"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
