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
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 pb-16 sm:px-6">
      <Suspense fallback={<CartSkeleton />}>
        <CartView />
      </Suspense>
    </div>
  );
}
