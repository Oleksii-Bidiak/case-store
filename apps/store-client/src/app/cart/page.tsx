import { Suspense } from "react";
import type { Metadata } from "next";
import { CartView, CartSkeleton } from "@/widgets";
import { dict, PAGE_CONTAINER } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.cartTitle,
  description: dict.meta.cartDescription,
};

export default function CartPage() {
  return (
    <div className={`${PAGE_CONTAINER} pt-8 pb-16`}>
      <Suspense fallback={<CartSkeleton />}>
        <CartView />
      </Suspense>
    </div>
  );
}
