import { Suspense } from "react";
import type { Metadata } from "next";
import { CartView, CartSkeleton } from "@/widgets";

export const metadata: Metadata = {
  title: "Cart | MobileStore",
  description: "Review and manage items in your shopping cart.",
};

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Suspense fallback={<CartSkeleton />}>
        <CartView />
      </Suspense>
    </div>
  );
}
