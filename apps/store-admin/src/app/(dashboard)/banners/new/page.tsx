import { Suspense } from "react";
import type { Metadata } from "next";
import { BannerFormSkeleton, CreateBannerView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.banners.metaTitleNew,
};

export default function NewBannerPage() {
  return (
    <Suspense
      fallback={<BannerFormSkeleton heading={dict.banners.createHeading} />}
    >
      <CreateBannerView />
    </Suspense>
  );
}
