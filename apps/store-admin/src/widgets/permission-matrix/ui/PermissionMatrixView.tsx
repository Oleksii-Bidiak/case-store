"use client";

import { usePermissionControllerGetMatrix } from "@/entities/permission";
import { PermissionMatrixForm } from "@/features/permission-matrix-form";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/** Loading placeholder shaped like the zone list underneath. */
export function PermissionMatrixSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

/**
 * The owner's permission-matrix screen (TASK-334).
 *
 * Owns the fetch and the loading / error / empty states; the editing itself
 * lives in the feature. The endpoint is owner-only, so a manager who typed the
 * URL gets a 403 here — and that is the real protection. The nav item is hidden
 * for them purely so the panel matches what they can do.
 */
export function PermissionMatrixView() {
  const { data, isLoading, isError } = usePermissionControllerGetMatrix();

  if (isLoading) {
    return <PermissionMatrixSkeleton />;
  }

  if (isError || !data?.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.permissionsMatrix.loadError}
      </p>
    );
  }

  const matrix = data.data;

  if (matrix.catalogue.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.permissionsMatrix.empty}
      </div>
    );
  }

  return <PermissionMatrixForm matrix={matrix} />;
}
