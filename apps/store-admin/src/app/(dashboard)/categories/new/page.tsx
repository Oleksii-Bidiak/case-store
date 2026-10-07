import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateCategoryView } from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.categories.metaTitleNew,
};

export default function NewCategoryPage() {
  // TASK-1781: `categories:delete` alone now leads to /categories — a
  // typed /categories/new gets one refusal, not a form that answers 403.
  return (
    <PermissionGate
      permission={PERM.categoriesWrite}
      title={dict.categories.readOnly.createForbidden}
      hint={dict.categories.readOnly.createForbiddenHint}
    >
      <Suspense fallback={<AdminFormSkeleton />}>
        <CreateCategoryView />
      </Suspense>
    </PermissionGate>
  );
}
