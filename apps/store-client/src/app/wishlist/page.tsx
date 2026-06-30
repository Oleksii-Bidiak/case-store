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
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistView />
      </Suspense>
    </div>
  );
}
