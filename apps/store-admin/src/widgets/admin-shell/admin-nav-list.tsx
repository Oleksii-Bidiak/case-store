"use client";

import {
  LayoutDashboard,
  Package,
  FileUp,
  Layers,
  Tag,
  Award,
  ShieldCheck,
  Smartphone,
  Ticket,
  FileText,
  Newspaper,
  ImageIcon,
  GalleryHorizontal,
  ShoppingCart,
  Star,
  MessageSquare,
  Users,
  Mail,
  Phone,
  Search,
  RefreshCw,
  HelpCircle,
  Map,
  KeyRound,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminContactUnreadCount } from "@/entities/contact";
import { useAdminDashboardControllerGetNeedsAction } from "@/entities/dashboard";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Badge } from "@/shared/ui";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

/**
 * One entry in the admin navigation.
 *
 * TASK-334: `permission` / `ownerOnly` decide whether the entry is RENDERED.
 * That is a convenience, not a control — the server guard is what actually
 * protects the route, and a link hidden here is still reachable by typing the
 * URL. The point is that a content manager gets an admin panel with no
 * «Замовлення» section at all, instead of one that shows the section and then
 * answers 403 when they click it.
 */
interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Permission(s) required to see this entry. An array means ALL of them are
   * required — used where one screen fans out to several guarded endpoints and
   * a partial grant would render a page of 403s.
   */
  permission?: string | string[];
  /** Owner-only (ADMIN). Never grantable — see permission.catalog.ts. */
  ownerOnly?: boolean;
}

const navItems: readonly NavItem[] = [
  // No permission: the dashboard is every staff member's landing page. Its
  // revenue/PII tiles are gated individually inside the page itself.
  { label: dict.nav.dashboard, href: "/", icon: LayoutDashboard },
  {
    label: dict.nav.products,
    href: "/products",
    icon: Package,
    permission: PERM.productsRead,
  },
  {
    label: dict.nav.catalogImport,
    href: "/catalog-import",
    icon: FileUp,
    permission: PERM.catalogImport,
  },
  {
    label: dict.nav.productGroups,
    href: "/product-groups",
    icon: Layers,
    permission: PERM.productsRead,
  },
  {
    label: dict.nav.categories,
    href: "/categories",
    icon: Tag,
    permission: PERM.categoriesWrite,
  },
  {
    label: dict.nav.brands,
    href: "/brands",
    icon: Award,
    permission: PERM.brandsWrite,
  },
  {
    label: dict.nav.addonServices,
    href: "/addon-services",
    icon: ShieldCheck,
    permission: PERM.addonsWrite,
  },
  {
    label: dict.nav.devices,
    href: "/devices/brands",
    icon: Smartphone,
    permission: PERM.devicesWrite,
  },
  {
    label: dict.nav.discounts,
    href: "/discounts",
    icon: Ticket,
    permission: PERM.discountsWrite,
  },
  {
    label: dict.nav.pages,
    href: "/pages",
    icon: FileText,
    permission: PERM.pagesWrite,
  },
  {
    label: dict.nav.blog,
    href: "/blog",
    icon: Newspaper,
    permission: PERM.blogWrite,
  },
  {
    label: dict.nav.banners,
    href: "/banners",
    icon: ImageIcon,
    permission: PERM.bannersWrite,
  },
  // TASK-139: label deliberately lives in this plan's own `carousels` namespace,
  // not the shared `dict.nav` registry (this wave's stricter dictionary scoping).
  {
    label: dict.carousels.navLabel,
    href: "/carousels",
    icon: GalleryHorizontal,
    permission: PERM.carouselsWrite,
  },
  {
    label: dict.nav.orders,
    href: "/orders",
    icon: ShoppingCart,
    permission: PERM.ordersRead,
  },
  {
    label: dict.nav.reviews,
    href: "/reviews",
    icon: Star,
    permission: PERM.reviewsModerate,
  },
  {
    label: dict.nav.messages,
    href: "/messages",
    icon: MessageSquare,
    permission: PERM.messagesRead,
  },
  {
    label: dict.nav.users,
    href: "/users",
    icon: Users,
    permission: PERM.customersRead,
  },
  {
    label: dict.nav.subscribers,
    href: "/subscribers",
    icon: Mail,
    permission: PERM.newsletterRead,
  },
];

const bottomNavItems: readonly NavItem[] = [
  {
    label: dict.nav.contentMap,
    href: "/content-map",
    icon: Map,
    // The content map counts banners, FAQ, pages and blog posts in one view;
    // with a partial grant every missing slice would render as an error, so it
    // asks for the full set.
    permission: [
      PERM.pagesWrite,
      PERM.bannersWrite,
      PERM.faqWrite,
      PERM.blogWrite,
    ],
  },
  {
    label: dict.nav.siteContact,
    href: "/settings/contact",
    icon: Phone,
    permission: PERM.settingsContacts,
  },
  {
    label: dict.nav.seoSettings,
    href: "/settings/seo",
    icon: Search,
    permission: PERM.settingsSeo,
  },
  // TASK-377 — the only way to repair a search that returns nothing. It had a
  // permission and an endpoint but no entry here, so the runbook's "finish it
  // from the admin panel" was not something anyone could do.
  {
    label: dict.nav.searchIndex,
    href: "/settings/search",
    icon: RefreshCw,
    permission: PERM.settingsSearch,
  },
  {
    label: dict.nav.faq,
    href: "/faq",
    icon: HelpCircle,
    permission: PERM.faqWrite,
  },
  // TASK-334 / TASK-318 — owner-only, and deliberately not grantable: a
  // permission to edit the matrix is a permission to grant yourself everything.
  {
    label: dict.nav.permissions,
    href: "/settings/permissions",
    icon: KeyRound,
    ownerOnly: true,
  },
  {
    label: dict.nav.auditLog,
    href: "/audit-log",
    icon: ScrollText,
    ownerOnly: true,
  },
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

interface AdminNavListProps {
  /**
   * Called after any nav link is clicked. The mobile drawer passes a handler
   * that closes itself on navigate (TASK-204 pattern); the desktop rail omits
   * it, since it never needs to auto-close.
   */
  onNavigate?: () => void;
}

/**
 * AdminNavList — the shared admin navigation body (main + bottom nav groups with
 * active-route highlighting and the TASK-248 count badges). Rendered by both the
 * desktop `AdminSidebar` rail and the `MobileNavDrawer`, so the nav structure and
 * badge logic are defined exactly once.
 *
 * It calls the badge-count hooks itself; both mount points therefore issue the
 * same TanStack Query keys, which React Query dedupes to a single cache entry and
 * in-flight request rather than doubling network calls. Both hooks are disabled
 * for a session that lacks the permission behind them (TASK-334) — otherwise the
 * nav would fire two guaranteed-403 requests on every page load for a manager
 * who cannot see either counter anyway.
 */
export function AdminNavList({ onNavigate }: AdminNavListProps) {
  const pathname = usePathname();
  const { can, canAll, isOwner } = useAuth();

  const canReadMessages = can(PERM.messagesRead);
  const canReadAnalytics = can(PERM.analyticsRead);

  // Unread (NEW) contact-message count for the sidebar badge. Refetches on
  // window focus so the badge stays roughly current as messages arrive.
  const { data: unreadData } = useAdminContactUnreadCount({
    query: { enabled: canReadMessages },
  });
  const unread = unreadData?.data?.unread ?? 0;

  // Needs-action counters (TASK-248) — same shared query key the dashboard
  // widget reads, so both refetch from one cache entry. Drives the count badges
  // next to «Замовлення» (new orders) and «Відгуки» (reviews awaiting moderation).
  const { data: needsActionData } = useAdminDashboardControllerGetNeedsAction({
    query: { enabled: canReadAnalytics },
  });
  const newOrders = needsActionData?.data?.newOrders ?? 0;
  const pendingReviews = needsActionData?.data?.pendingReviews ?? 0;

  const isVisible = (item: NavItem): boolean => {
    if (item.ownerOnly) return isOwner;
    if (item.permission === undefined) return true;
    return Array.isArray(item.permission)
      ? canAll(item.permission)
      : can(item.permission);
  };

  const visibleNavItems = navItems.filter(isVisible);
  const visibleBottomNavItems = bottomNavItems.filter(isVisible);

  return (
    <>
      {/* Main navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleNavItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
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

      {visibleBottomNavItems.length > 0 && (
        <>
          <Separator />

          {/* Bottom navigation */}
          <nav className="space-y-1 px-3 py-4">
            {visibleBottomNavItems.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={onNavigate}
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
        </>
      )}
    </>
  );
}
