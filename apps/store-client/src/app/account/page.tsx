import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountView, AccountProfileSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.accountTitle,
  description: dict.meta.accountDescription,
};

export default function AccountPage() {
  return (
    // AccountView reads `?section=` (TASK-867), so it renders behind Suspense.
    // The fallback is content-only: the frame is AccountShell, from the
    // account layout (TASK-217).
    <Suspense fallback={<AccountProfileSkeleton />}>
      <AccountView />
    </Suspense>
  );
}
