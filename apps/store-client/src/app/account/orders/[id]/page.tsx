import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { dict, H1_CLASS } from "@/shared/config";

interface AccountOrderPageProps {
  params: Promise<{ id: string }>;
}

const orderRef = (id: string) => id.slice(0, 8).toUpperCase();

export async function generateMetadata({
  params,
}: AccountOrderPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: dict.meta.accountOrderTitle(orderRef(id)),
    robots: { index: false, follow: false },
  };
}

/**
 * `/account/orders/[id]` — one order inside the account (TASK-217).
 * PLACEHOLDER for the shell step: the detail screen replaces it in a later
 * step. Below `lg` the shell drops its back-home line and chip strip on this
 * route, so the «← Історія замовлень» link here is the way back.
 */
export default async function AccountOrderPage({
  params,
}: AccountOrderPageProps) {
  const { id } = await params;
  const d = dict.account.dashboard;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-2 self-start rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4.5" aria-hidden="true" />
        {d.nav.orders}
      </Link>
      <h1 className={`${H1_CLASS} text-foreground`}>
        {d.orderHeading(orderRef(id))}
      </h1>
    </div>
  );
}
