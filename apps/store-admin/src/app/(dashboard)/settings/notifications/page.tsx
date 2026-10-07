import { Suspense } from "react";
import type { Metadata } from "next";
import {
  NotificationSettingsPageSkeleton,
  NotificationSettingsView,
} from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.notificationSettings.metaTitle,
};

export default function NotificationSettingsPage() {
  return (
    <Suspense fallback={<NotificationSettingsPageSkeleton />}>
      <NotificationSettingsView />
    </Suspense>
  );
}
