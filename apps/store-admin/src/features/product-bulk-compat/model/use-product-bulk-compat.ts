"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminDeviceCompatControllerBulkUpdateCompat,
  type BulkCompatMode,
} from "@/entities/device";
import { useBulkStatus } from "@/features/bulk-status";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";

const t = dict.bulkCompat;

/** What one bulk compat write sends besides the product ids. */
export interface BulkCompatChange {
  mode: BulkCompatMode;
  /** Whole series, expanded by the API. */
  series: string[];
  deviceModelIds: string[];
}

export interface UseProductBulkCompatOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface ProductBulkCompatApi {
  run: (productIds: string[], change: BulkCompatChange) => void;
  isPending: boolean;
  /** The replace prompt — render once in the caller's JSX. */
  confirmDialog: ReactNode;
}

/**
 * Bulk «Сумісність…» (TASK-1955): add / remove / replace the same device models on
 * many products in one `PUT /admin/devices/compat/bulk`. Also the coverage page's
 * one-product «Додати».
 *
 * Built on `useBulkStatus` (TASK-812) like the colour action: no optimistic
 * write, the announcement and the toast report what the DATABASE changed
 * (`updatedProducts`). Only `replace` confirms first — it erases the old sets and
 * nothing keeps them; add and remove are undone by running the other one.
 *
 * Every product query is invalidated after the write: the list, the product
 * pages and the device coverage numbers all read compat.
 */
export function useProductBulkCompat({
  onSuccess,
}: UseProductBulkCompatOptions = {}): ProductBulkCompatApi {
  const queryClient = useQueryClient();
  const mutation = useAdminDeviceCompatControllerBulkUpdateCompat();

  const { run, isPending, confirmDialog } = useBulkStatus({
    mutation,
    toVariables: (productIds, change: BulkCompatChange) => ({
      data: {
        productIds,
        mode: change.mode,
        ...(change.series.length > 0 && { series: change.series }),
        ...(change.deviceModelIds.length > 0 && {
          deviceModelIds: change.deviceModelIds,
        }),
      },
    }),
    confirmFor: (productIds, change) =>
      change.mode === "replace"
        ? {
            description: t.replaceConfirm(productIds.length),
            confirmLabel: t.replaceConfirmLabel,
            destructive: true,
          }
        : null,
    announceSaving: (count) => t.announceSaving(count),
    announceDone: (response) => t.done(response.data.updatedProducts),
    announceFailed: t.failed,
    onWritten: (response) => {
      toast.success(t.done(response.data.updatedProducts));
      // Products (list, detail, preview) and the device pages' coverage.
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const [url] = query.queryKey as [unknown];
          return (
            typeof url === "string" &&
            (url.startsWith("/api/products") ||
              url.startsWith("/api/admin/devices"))
          );
        },
      });
    },
    onSuccess,
  });

  return { run, isPending, confirmDialog };
}
