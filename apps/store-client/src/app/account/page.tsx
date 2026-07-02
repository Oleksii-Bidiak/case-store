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
    <Suspense fallback={<AccountSkeleton />}>
      <AccountView />
    </Suspense>
  );
}
