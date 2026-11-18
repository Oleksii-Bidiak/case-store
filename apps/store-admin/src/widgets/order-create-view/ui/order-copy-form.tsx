"use client";

import { useAdminOrderControllerGetCopyDraft } from "@/entities/order";
import { OrderCreateForm } from "@/features/order-create";
import { dict } from "@/shared/config";

/**
 * «Створити копію» (TASK-2048): the create form started from an original —
 * rendered once its prefill (`GET /admin/orders/:id/copy-draft`) has arrived,
 * so the operator never edits an empty form that is about to be filled.
 */
export function OrderCopyForm({ copyOf }: { copyOf: string }) {
  const { data, isLoading, isError } =
    useAdminOrderControllerGetCopyDraft(copyOf);

  if (isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {dict.orderCreate.copyLoading}
      </p>
    );
  }
  if (isError || !data?.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.orderCreate.copyLoadFailed}
      </p>
    );
  }
  return <OrderCreateForm copyDraft={data.data} />;
}
