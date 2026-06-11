import type { Metadata } from "next";
import Link from "next/link";

/**
 * STUB confirmation route (TASK-035-J). This is the redirect target after a
 * successful order. TASK-036 (OrderConfirmationPage) replaces this file with the
 * full confirmation UI — order details, item list, totals, and CTAs.
 */

export const metadata: Metadata = {
  title: "Order Confirmed | MobileStore",
};

interface OrderConfirmationPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderConfirmationPage({
  params,
}: OrderConfirmationPageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold text-foreground">
        Thank you for your order!
      </h1>
      <p className="text-foreground">
        Your order <strong>{id}</strong> has been placed.
      </p>
      <p className="text-muted-foreground">Full order details coming soon.</p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Continue shopping
      </Link>
    </div>
  );
}
