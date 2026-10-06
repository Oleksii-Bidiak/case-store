"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthControllerLogout } from "@/entities/session";
import { useUserControllerGetProfile } from "@/entities/user";
import { dict, PAGE_CONTAINER, STICKY_ASIDE_TOP } from "@/shared/config";
import { AccountBackIcon, AccountLogoutIcon } from "./account-icons";
import { AccountSectionStrip, AccountSidebarNav } from "./account-nav-links";
import {
  ACCOUNT_ORDERS_PATH,
  ACCOUNT_PATH,
  isAccountOrderDetailPath,
} from "./account-nav";
import {
  AccountProfileSkeleton,
  AccountShellSkeleton,
} from "./account-skeleton";

/**
 * The one auth guard of the account (TASK-217): every route under `/account`
 * renders inside the shell, so none of them carries its own. A signed-out
 * visitor goes to the login with the full path AND query as `?redirect=`
 * (TASK-419), so `/account?section=settings` or an order detail come back to
 * exactly where they were. Its own component behind `<Suspense>` because
 * `useSearchParams` would otherwise opt the prerendered shell out of static
 * rendering.
 */
function AccountAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isInitializing } = useAuth();

  useEffect(() => {
    if (isInitializing || isAuthenticated) return;
    const query = searchParams.toString();
    const target = query ? `${pathname}?${query}` : pathname;
    router.replace(`/login?redirect=${encodeURIComponent(target)}`);
  }, [isInitializing, isAuthenticated, pathname, searchParams, router]);

  return null;
}

/**
 * AccountShell — the frame shared by every account route (`/account`,
 * `/account/orders`, `/account/orders/[id]`; AccountOrders.dc.html):
 *
 * - «Повернутись на головну», then from `lg` the 264px sticky menu card
 *   (avatar, greeting, phone, the sections, «Вихід») beside a fluid content
 *   column;
 * - below `lg` the menu card is replaced by a scrolling strip of section chips
 *   above the content;
 * - on an order detail, below `lg`, neither the back-home line nor the strip:
 *   the detail has its own «← Історія замовлень», and two ways "back" stacked
 *   on a phone would compete. The sidebar stays from `lg`.
 *
 * While the session restores, the profile loads or a signed-out visitor is
 * being redirected, the shell renders its own skeleton (TASK-869) — children
 * are not mounted, so no route under it queries the API unauthenticated.
 */
export function AccountShell({
  children,
  ordersSkeleton = null,
  orderDetailSkeleton = null,
}: {
  children: ReactNode;
  /**
   * The order list's own skeleton, shown in the content column while the
   * shell itself loads on `/account/orders` (TASK-217). Passed in by the app
   * layout: it belongs to `widgets/order-history`, which this widget cannot
   * import.
   */
  ordersSkeleton?: ReactNode;
  /** Same, for `/account/orders/<id>` — from `widgets/order-detail`. */
  orderDetailSkeleton?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { isAuthenticated, isInitializing, clearTokens } = useAuth();
  const logout = useAuthControllerLogout();

  const { data, isLoading } = useUserControllerGetProfile({
    query: { enabled: isAuthenticated },
  });

  const detail = isAccountOrderDetailPath(pathname);
  const guard = (
    <Suspense fallback={null}>
      <AccountAuthRedirect />
    </Suspense>
  );

  if (isInitializing || !isAuthenticated || isLoading) {
    return (
      <>
        {guard}
        <AccountShellSkeleton detail={detail}>
          {pathname === ACCOUNT_PATH ? (
            <AccountProfileSkeleton />
          ) : pathname === ACCOUNT_ORDERS_PATH ? (
            ordersSkeleton
          ) : detail ? (
            orderDetailSkeleton
          ) : null}
        </AccountShellSkeleton>
      </>
    );
  }

  const d = dict.account.dashboard;
  // A failed profile request still renders the frame: the menu works without
  // a name, and `/account` itself reports the error in its content column.
  const user = data?.data;
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "";
  const initials =
    (
      (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "")
    ).toUpperCase() || (user?.email?.[0] ?? "?").toUpperCase();

  function handleLogout() {
    logout.mutate(undefined, {
      onSettled: () => {
        clearTokens();
        queryClient.clear();
        router.push("/");
      },
    });
  }

  return (
    <div
      data-testid="account-shell"
      className={`${PAGE_CONTAINER} pt-5.5 pb-16`}
    >
      {guard}
      <Link
        href="/"
        className={`mb-5.5 items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          detail ? "hidden lg:inline-flex" : "inline-flex"
        }`}
      >
        <AccountBackIcon width={18} height={18} />
        {d.backHome}
      </Link>

      {!detail && <AccountSectionStrip />}

      <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
        <aside
          data-testid="account-aside"
          className={`hidden rounded-card border border-border bg-card p-2 shadow-card lg:block lg:w-66 lg:shrink-0 lg:sticky ${STICKY_ASIDE_TOP}`}
        >
          <div className="flex items-center gap-3 px-3 pt-3.5 pb-4">
            {/* Brand tint as a token utility over the card (TASK-879). */}
            <span className="inline-flex size-11.5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-lg font-bold text-primary">
              {initials}
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="truncate font-display text-sm leading-tight text-foreground">
                {d.greeting(fullName)}
              </b>
              {user?.phone && (
                <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {user.phone}
                </span>
              )}
            </span>
          </div>
          <div className="mx-1 mb-1.5 h-px bg-border" />

          <AccountSidebarNav />

          <div className="mx-1 my-1.5 h-px bg-border" />
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex w-full items-center gap-3 rounded-menu px-3.5 py-2.75 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <AccountLogoutIcon width={20} height={20} />
            {d.logout}
          </button>
        </aside>

        <section className="min-w-0 lg:flex-1">{children}</section>
      </div>
    </div>
  );
}
