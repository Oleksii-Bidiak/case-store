"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package } from "lucide-react";
import { useAuth } from "@/entities/session";
import {
  awaitingPaymentMinutes,
  useGetOrders,
  useNow,
  type GetOrdersParams,
  type OrderEntity,
} from "@/entities/order";
import { useGetMyReturns, type ReturnEntity } from "@/entities/return";
import { dict, H1_CLASS } from "@/shared/config";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import {
  ORDER_TAB_STATUSES,
  ORDER_TABS,
  ORDERS_PAGE_SIZE,
  ordersHref,
  parseOrderTab,
  parseOrdersPage,
  type OrderTab,
} from "../model/order-history-params";
import { OrderCard } from "./order-card";
import { ORDER_LIST_CLASS } from "./order-card-class";
import { OrderCardsSkeleton } from "./order-history-skeleton";

/**
 * The status of the NEWEST return request per order (TASK-608). The API lists
 * newest first, so the first row seen for an order is the one to show — an
 * order can carry several requests (one unit now, another next week), and the
 * latest is what the customer is waiting on.
 */
function latestReturnStatusByOrder(
  returns: readonly ReturnEntity[],
): Map<string, string> {
  const byOrder = new Map<string, string>();
  for (const row of returns) {
    if (!byOrder.has(row.orderId)) byOrder.set(row.orderId, row.status);
  }
  return byOrder;
}

function tabParams(
  tab: OrderTab,
  page: number,
  limit: number,
): GetOrdersParams {
  const statuses = ORDER_TAB_STATUSES[tab];
  return {
    ...(statuses ? { status: [...statuses] } : {}),
    page,
    limit,
  };
}

/**
 * A tab's total for its counter — `GET /api/orders?…&limit=1`, read from
 * `meta.total`. The selected tab is not asked twice: its total comes from the
 * page query itself.
 */
function useTabTotal(
  tab: OrderTab,
  selected: OrderTab,
  enabled: boolean,
): number | undefined {
  const { data } = useGetOrders(tabParams(tab, 1, 1), {
    query: {
      enabled: enabled && tab !== selected,
      select: (response) => response.meta.total,
    },
  });
  return data;
}

/** Whether a card could be showing the «Очікує оплати» countdown at all. */
function mayAwaitPayment(order: OrderEntity): boolean {
  return (
    order.paymentMethod === "ONLINE" &&
    order.paymentStatus === "PENDING" &&
    order.status === "PENDING" &&
    order.reservationExpiresAt !== null
  );
}

interface OrderHistoryViewProps {
  /**
   * A one-off notice between the heading and the tabs — the app passes the
   * «Ми знайшли ваші попередні замовлення» banner (TASK-485), which lives in
   * `widgets/account` and so cannot be imported from here.
   */
  notice?: ReactNode;
}

/**
 * OrderHistoryView — `/account/orders` (TASK-217, AccountOrders.dc.html).
 *
 * Renders inside the account shell, which owns the frame and the ONE auth
 * guard; the queries still wait for a session so nothing is asked
 * unauthenticated. State lives in the URL: `?status=all|active|delivered|
 * cancelled` (unknown → all) and `?page=` (switching a tab resets it; a page
 * past the end is replaced with the last one).
 *
 * States: skeleton cards under the real heading and tabs while a page loads;
 * an alert + «Спробувати ще раз» on failure; the big empty card when the
 * account has no orders at all; one muted line when only the selected tab is
 * empty.
 */
export function OrderHistoryView({ notice }: OrderHistoryViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();

  const tab = parseOrderTab(searchParams.get("status"));
  const page = parseOrdersPage(searchParams.get("page"));

  const list = useGetOrders(tabParams(tab, page, ORDERS_PAGE_SIZE), {
    query: { enabled: isAuthenticated },
  });

  const totals: Record<OrderTab, number | undefined> = {
    all: useTabTotal("all", tab, isAuthenticated),
    active: useTabTotal("active", tab, isAuthenticated),
    delivered: useTabTotal("delivered", tab, isAuthenticated),
    cancelled: useTabTotal("cancelled", tab, isAuthenticated),
  };
  totals[tab] = list.data?.meta.total;

  // TASK-608: one request for every return the customer has, instead of one
  // per card. A failure costs the page nothing but the return badges, so it
  // is deliberately not part of the loading/error gate.
  const { data: myReturns } = useGetMyReturns({
    query: { enabled: isAuthenticated },
  });

  const orders = list.data?.data ?? [];
  const totalPages = list.data?.meta.totalPages;
  const lastPage = Math.max(1, totalPages ?? 1);
  const pastTheEnd = totalPages !== undefined && page > lastPage;

  // One clock for every card; it only ticks while a countdown can show.
  const now = useNow(orders.some(mayAwaitPayment));

  const hrefFor = (next: { tab: OrderTab; page: number }) =>
    ordersHref(pathname, searchParams, next);

  // A page past the end (a stale link, the last order of the last page just
  // cancelled into another tab) is replaced with the last page that exists.
  const clampHref = pastTheEnd ? hrefFor({ tab, page: lastPage }) : null;
  useEffect(() => {
    if (clampHref) router.replace(clampHref, { scroll: false });
  }, [clampHref, router]);

  const accountEmpty = totals.all === 0;
  const latestReturn = latestReturnStatusByOrder(myReturns?.data ?? []);
  const selectedTotal = totals[tab];

  const header = (
    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
      <h1 className={`${H1_CLASS} text-foreground`}>
        {dict.orderHistory.title}
      </h1>
      {!list.isError && !accountEmpty && selectedTotal !== undefined && (
        <span className="text-sm text-muted-foreground">
          {dict.orderHistory.count(selectedTotal)}
        </span>
      )}
    </div>
  );

  if (list.isError) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {notice}
        <div className="flex flex-col items-start gap-3">
          <p
            role="alert"
            className="rounded-menu border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {dict.orderHistory.loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void list.refetch()}
            className="h-11 rounded-cta px-4.5 font-semibold"
          >
            {dict.common.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (accountEmpty) {
    // Design-system §6 (TASK-870): icon + one line + a primary action, the
    // same card as every other empty list on the storefront. No tabs: there
    // is nothing to filter.
    return (
      <div className="flex flex-col gap-5">
        {header}
        {notice}
        <div className="flex flex-col items-center justify-center rounded-card border border-border bg-card px-5 py-14 text-center shadow-card">
          <span
            aria-hidden="true"
            className="mb-4 inline-flex size-18 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Package className="size-8" strokeWidth={1.6} />
          </span>
          <p className="max-w-md font-display text-xl font-bold text-foreground">
            {dict.orderHistory.empty}
          </p>
          <Button asChild size="lg" className="mt-5 h-11 rounded-cta px-6">
            <Link href="/products">{dict.orderHistory.emptyCta}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const loading = list.isPending || pastTheEnd;

  return (
    <div className="flex flex-col gap-5">
      {header}
      {notice}

      <Tabs
        value={tab}
        onValueChange={(value) =>
          router.push(hrefFor({ tab: parseOrderTab(value), page: 1 }), {
            scroll: false,
          })
        }
        className="gap-5"
      >
        {/* Scrolls sideways on a phone, bleeding to the screen edge so the
            clipped last tab says "more" (design-system §5, chip rows). */}
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <TabsList aria-label={dict.orderHistory.tabsAria}>
            {ORDER_TABS.map((key) => (
              <TabsTrigger key={key} value={key} className="flex-none px-3">
                {dict.orderHistory.tabs[key]}
                {totals[key] !== undefined && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {totals[key]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={tab} className="flex flex-col gap-3">
          {loading ? (
            <OrderCardsSkeleton />
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {dict.orderHistory.tabEmpty}
            </p>
          ) : (
            <>
              <ul className={ORDER_LIST_CLASS}>
                {orders.map((order) => (
                  <li key={order.id}>
                    <OrderCard
                      order={order}
                      returnStatus={latestReturn.get(order.id)}
                      awaitingMinutes={awaitingPaymentMinutes(order, now)}
                    />
                  </li>
                ))}
              </ul>
              {lastPage > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={lastPage}
                  buildHref={(target) => hrefFor({ tab, page: target })}
                  className="mt-3"
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
