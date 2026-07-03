import { Suspense } from "react";
import type { Metadata } from "next";
import { WishlistView, WishlistSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.wishlist.metaTitle,
  description: dict.wishlist.metaDescription,
};

export default function WishlistPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistView />
      </Suspense>
    </div>
  );
}
