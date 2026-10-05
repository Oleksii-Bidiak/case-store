import type { Metadata } from "next";
import { dict, H1_CLASS } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.accountOrdersTitle,
  description: dict.meta.ordersDescription,
  robots: { index: false, follow: false },
};

/**
 * `/account/orders` — the order history inside the account (TASK-217).
 * PLACEHOLDER for the shell step: the list (tabs, cards, pagination) replaces
 * this heading in the next step. The frame and the auth guard are the account
 * layout's AccountShell.
 */
export default function AccountOrdersPage() {
  return (
    <h1 className={`${H1_CLASS} text-foreground`}>
      {dict.account.dashboard.nav.orders}
    </h1>
  );
}
