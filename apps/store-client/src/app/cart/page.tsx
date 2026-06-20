import { Suspense } from "react";
import type { Metadata } from "next";
import { CartView, CartSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.cartTitle,
  description: dict.meta.cartDescription,
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
