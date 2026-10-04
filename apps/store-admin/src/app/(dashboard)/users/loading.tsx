import { AdminUserTableSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/users` (canon 1.7): the page header, then the
 * table skeleton with the table's own columns — so the title does not jump in
 * when the list arrives.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.users.heading}
        description={dict.users.intro}
      />
      <AdminUserTableSkeleton />
    </div>
  );
}
