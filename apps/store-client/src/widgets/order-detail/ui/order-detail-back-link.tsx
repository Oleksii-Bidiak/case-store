import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { dict } from "@/shared/config";

export const ACCOUNT_ORDERS_HREF = "/account/orders";

/**
 * «← Історія замовлень» — a 44px hit area on a 20px text line. A real link in
 * every state of the detail, the skeleton included (AccountOrders.dc.html keeps
 * it outside the skeleton): it needs no data, and a shopper on a slow order
 * can already go back. Server-compatible.
 */
export function OrderDetailBackLink() {
  return (
    <Link
      href={ACCOUNT_ORDERS_HREF}
      className="-my-3 inline-flex items-center gap-2 self-start rounded-sm py-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeft className="size-4.5" aria-hidden="true" />
      {dict.account.dashboard.nav.orders}
    </Link>
  );
}
