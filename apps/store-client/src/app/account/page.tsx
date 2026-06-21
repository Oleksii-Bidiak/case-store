import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountView } from "@/widgets";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.accountTitle,
  description: dict.meta.accountDescription,
};

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Suspense
        fallback={<Skeleton className="mx-auto h-64 w-full max-w-2xl" />}
      >
        <AccountView />
      </Suspense>
    </div>
  );
}
