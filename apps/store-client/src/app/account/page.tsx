import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountView, AccountSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.accountTitle,
  description: dict.meta.accountDescription,
};

export default function AccountPage() {
  return (
    // AccountSkeleton carries the dashboard's own container, the same one
    // `loading.tsx` and AccountView's loading branch render (TASK-869).
    <Suspense fallback={<AccountSkeleton />}>
      <AccountView />
    </Suspense>
  );
}
