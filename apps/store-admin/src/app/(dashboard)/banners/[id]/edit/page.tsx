import { Suspense } from "react";
import type { Metadata } from "next";
import { BannerFormSkeleton, EditBannerView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.banners.metaTitleEdit,
};

interface EditBannerPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBannerPage({ params }: EditBannerPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<BannerFormSkeleton />}>
      <EditBannerView bannerId={id} />
    </Suspense>
  );
}
