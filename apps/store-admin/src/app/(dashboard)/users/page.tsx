import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminUserTable, AdminUserTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.users.metaTitle,
};

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-foreground">
        {dict.users.heading}
      </h2>

      <Suspense fallback={<AdminUserTableSkeleton />}>
        <AdminUserTable />
      </Suspense>
    </div>
  );
}
