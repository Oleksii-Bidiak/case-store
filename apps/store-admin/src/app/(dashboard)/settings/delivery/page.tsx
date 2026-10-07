import { Suspense } from "react";
import type { Metadata } from "next";
import { DeliverySettingsPageSkeleton, DeliverySettingsView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.deliverySettings.metaTitle,
};

export default function DeliverySettingsPage() {
  return (
    <Suspense fallback={<DeliverySettingsPageSkeleton />}>
      <DeliverySettingsView />
    </Suspense>
  );
}
