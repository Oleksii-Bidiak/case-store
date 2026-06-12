import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminUserTable, AdminUserTableSkeleton } from "@/widgets";

export const metadata: Metadata = {
  title: "Users — Admin",
};

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-foreground">Users</h2>

      <Suspense fallback={<AdminUserTableSkeleton />}>
        <AdminUserTable />
      </Suspense>
    </div>
  );
}
