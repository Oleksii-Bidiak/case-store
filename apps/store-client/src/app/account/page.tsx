import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountView, AccountSkeleton } from "@/widgets";
import { dict, PAGE_CONTAINER } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.accountTitle,
  description: dict.meta.accountDescription,
};

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        // Same container as `loading.tsx`; AccountView owns its own once loaded.
        <div className={`${PAGE_CONTAINER} py-8`}>
          <AccountSkeleton />
        </div>
      }
    >
      <AccountView />
    </Suspense>
  );
}
