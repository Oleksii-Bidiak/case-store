import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateBannerView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.banners.metaTitleNew,
};

export default function NewBannerPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateBannerView />
    </Suspense>
  );
}
