import { Suspense } from "react";
import type { Metadata } from "next";
import { WishlistView, WishlistSkeleton } from "@/widgets";
import { dict, PAGE_CONTAINER } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.wishlist.metaTitle,
  description: dict.wishlist.metaDescription,
};

export default function WishlistPage() {
  return (
    <div className={`${PAGE_CONTAINER} pt-5.5 pb-16`}>
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistView />
      </Suspense>
    </div>
  );
}
