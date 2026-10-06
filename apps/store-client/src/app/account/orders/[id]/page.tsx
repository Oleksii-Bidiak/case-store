import type { Metadata } from "next";
import { OrderDetailView } from "@/widgets";
import { dict } from "@/shared/config";

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
 * `/account/orders/[id]` — one order inside the account (TASK-217). The frame,
 * the menu and the auth guard are the account layout's AccountShell; below
 * `lg` the shell drops its back-home line and chip strip on this route, so the
 * view's own «← Історія замовлень» is the way back.
 *
 * Not to be confused with `/orders/[id]/confirmation`, checkout's step 3 (the
 * provider's `result_url`, the thank-you and the `purchase` event). That page
 * stays; it links here.
 */
export default async function AccountOrderPage({
  params,
}: AccountOrderPageProps) {
  const { id } = await params;
  return <OrderDetailView orderId={id} />;
}
