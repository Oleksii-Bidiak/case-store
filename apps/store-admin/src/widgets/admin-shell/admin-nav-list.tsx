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
  Images,
  GalleryHorizontal,
  ShoppingCart,
  Undo2,
  Star,
  MessageSquare,
  Users,
  ShieldUser,
  Mail,
  Phone,
  Search,
  RefreshCw,
  HelpCircle,
  Map,
  ScrollText,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminContactUnreadCount } from "@/entities/contact";
import {
  OrderEntityStatus,
  useAdminOrderControllerFindAll,
} from "@/entities/order";
import {
  AdminReviewControllerListStatus,
  useAdminReviewControllerList,
} from "@/entities/review";
import { PERM } from "@/entities/permission";
import {
  ReturnEntityStatus,
  useAdminReturnControllerFindAll,
} from "@/entities/return";
import { useAuth } from "@/entities/session";
import { Badge } from "@/shared/ui";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/shared/lib/utils";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
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
  /**
   * Visible to the ONE account that owns the shop, and not to a deputy admin
   * (TASK-475). Unused today — nothing in the nav is part of the owner's reserve
   * yet — and kept because ownership transfer (TASK-478) is. Do not reach for it
   * to mean "senior staff": `audit:read` and `staff:read` say that, and they say
   * it to deputies too.
   */
  ownerOnly?: boolean;
  /**
   * Route prefix that lights this entry, when it differs from `href` (wave
   * 198). «Пристрої» links to `/devices/brands` but owns `/devices/models*` too
   * — matching on `href` left the models tab with nothing lit in the menu.
   */
  activePrefix?: string;
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
    activePrefix: "/devices",
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
  // TASK-441 — gated on the READ key alone. The screen is useful to anyone who
  // may look at a picture, and `media:write` is checked inside it to decide
  // whether the upload zone and the delete button render at all; requiring it
  // here would hide the library from a manager who is allowed to browse it.
  {
    label: dict.nav.media,
    href: "/media",
    icon: Images,
    permission: PERM.mediaRead,
  },
  {
    label: dict.nav.orders,
    href: "/orders",
    icon: ShoppingCart,
    permission: PERM.ordersRead,
  },
  // TASK-370 — the returns queue has been built and working since TASK-340 and
  // had no way in: no menu entry, so the only route to it was typing /returns.
  // Gated on the READ key alone, matching the pattern of every other section —
  // `returns:write` is what the decision form asks for, and demanding it here
  // would hide the queue from a manager who is allowed to read it.
  {
    label: dict.nav.returns,
    href: "/returns",
    icon: Undo2,
    permission: PERM.returnsRead,
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
  // TASK-480 — «Персонал». Gated on `staff:read`, which like `audit:read` is a
  // real, enforced key that is never OFFERED on any granting screen, so only the
  // owner and their deputies hold it. NOT `ownerOnly`: that would now mean the
  // single owner account and would hide the staff register from a deputy, who is
  // exactly the person meant to hire a replacement while the owner is away.
  {
    label: dict.nav.staff,
    href: "/staff",
    icon: ShieldUser,
    permission: PERM.staffRead,
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
  // TASK-644 — which delivery methods the checkout offers and what the courier
  // costs. Right after «Пошук», as in the Д-н2 mockup.
  {
    label: dict.nav.delivery,
    href: "/settings/delivery",
    icon: Truck,
    permission: PERM.settingsDelivery,
  },
  {
    label: dict.nav.faq,
    href: "/faq",
    icon: HelpCircle,
    permission: PERM.faqWrite,
  },
  // TASK-318 / TASK-475 — the log is gated by `audit:read`, a key that is real
  // and enforced but never OFFERED on any granting screen, so in practice only
  // the owner and their deputies hold it. `ownerOnly: true` would now mean the
  // single owner account and would hide the log from a deputy admin, who is
  // exactly the person meant to be able to read it while the owner is away.
  {
    label: dict.nav.auditLog,
    href: "/audit-log",
    icon: ScrollText,
    permission: PERM.auditRead,
  },
];

/**
 * Determine whether a nav item is the active route.
 * The dashboard ("/") matches exactly; section links match their sub-routes.
 */
function isNavItemActive(pathname: string, item: NavItem): boolean {
  const prefix = item.activePrefix ?? item.href;
  if (prefix === "#") return false;
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
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
  const canReadOrders = can(PERM.ordersRead);
  const canModerateReviews = can(PERM.reviewsModerate);
  const canReadReturns = can(PERM.returnsRead);

  // Unread (NEW) contact-message count for the sidebar badge. Refetches on
  // window focus so the badge stays roughly current as messages arrive.
  const { data: unreadData } = useAdminContactUnreadCount({
    query: { enabled: canReadMessages },
  });
  const unread = unreadData?.data?.unread ?? 0;

  // Count badges next to «Замовлення» (new orders) and «Відгуки» (reviews
  // awaiting moderation), TASK-248.
  //
  // TASK-722: each is gated on the right of ITS section, not on
  // `analytics:read`. They used to come from the dashboard's needs-action
  // endpoint, which sits wholly behind analytics — so an order operator without
  // the dashboard never saw that new orders had arrived. `RequirePermission`
  // cannot express "any of", so rather than widen that endpoint the counts are
  // read as `meta.total` of the sections' own lists, one row each:
  //  - orders: `status=PENDING` is `{ status: PENDING, deletedAt: null }`, the
  //    dashboard's `newOrders` predicate;
  //  - reviews: `status=pending` runs through the same
  //    `moderationQueueWhere(PENDING)` as the dashboard's `pendingReviews`, so
  //    the badge and the queue it leads to cannot disagree.
  // Every write that moves either number already invalidates these list keys
  // by prefix (status changes, moderation), so the badges refresh with them.
  // They also share the operational freshness of the lists they lead to (30 s
  // and a focus refetch, not the panel-wide five minutes): a colleague's new
  // order must show up on the badge as soon as it shows up on «Нові».
  const { data: pendingOrdersData } = useAdminOrderControllerFindAll(
    { status: OrderEntityStatus.PENDING, limit: 1 },
    { query: { ...OPERATIONAL_LIST_QUERY, enabled: canReadOrders } },
  );
  const { data: pendingReviewsData } = useAdminReviewControllerList(
    { status: AdminReviewControllerListStatus.pending, limit: 1 },
    { query: { ...OPERATIONAL_LIST_QUERY, enabled: canModerateReviews } },
  );
  // Wave 198 (TASK-1034): «Повернення» counts requests still REQUESTED — the
  // dashboard tile's exact query (TASK-613), so the two share one cache entry
  // and cannot disagree. Gated on the queue's own read key, like the others.
  const { data: newReturnsData } = useAdminReturnControllerFindAll(
    { status: ReturnEntityStatus.REQUESTED, limit: 1 },
    { query: { ...OPERATIONAL_LIST_QUERY, enabled: canReadReturns } },
  );
  const newOrders = pendingOrdersData?.meta?.total ?? 0;
  const pendingReviews = pendingReviewsData?.meta?.total ?? 0;
  const newReturns = newReturnsData?.meta?.total ?? 0;

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
          const active = isNavItemActive(pathname, item);
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
              {item.href === "/returns" && newReturns > 0 && (
                <Badge
                  variant={active ? "secondary" : "default"}
                  aria-label={dict.header.newReturnsBadgeAria(newReturns)}
                  className="ml-auto"
                >
                  {newReturns}
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
              const active = isNavItemActive(pathname, item);
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
