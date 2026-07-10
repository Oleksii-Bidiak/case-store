"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminFaqControllerFindAllQueryKey,
  useAdminFaqControllerFindAll,
  useAdminFaqControllerUpdate,
  useAdminFaqControllerRemove,
  type FaqItemEntity,
} from "@/entities/faq";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminFaqTableSkeleton } from "./faq-table-skeleton";

/**
 * Admin FAQ list. Renders every FAQ item (any status) ordered by sortOrder, with
 * per-row edit / show-hide toggle / delete. Not paginated — the FAQ list is
 * small (a handful of store-wide questions). Reorder is done by editing the
 * `sortOrder` field on each item; the list reflects the resulting order.
 */
export function AdminFaqTable() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, isError } =
    useAdminFaqControllerFindAll();
  const update = useAdminFaqControllerUpdate();
  const remove = useAdminFaqControllerRemove();

  const items = data?.data ?? [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminFaqControllerFindAllQueryKey(),
    });

  const handleToggle = (item: FaqItemEntity) => {
    update.mutate(
      { id: item.id, data: { isActive: !item.isActive } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            item.isActive ? dict.faq.toastDeactivated : dict.faq.toastActivated,
          );
        },
        onError: () => toast.error(dict.faq.toastStatusFailed),
      },
    );
  };

  const handleDelete = (item: FaqItemEntity) => {
    if (!window.confirm(dict.faq.deleteConfirm)) return;
    remove.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.faq.toastDeleted);
        },
        onError: () => toast.error(dict.faq.toastDeleteFailed),
      },
    );
  };

  if (isLoading) {
    return <AdminFaqTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.faq.loadError}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.faq.empty}
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border border-border shadow-card overflow-hidden">
      {isFetching && !isLoading && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
        >
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.faq.colQuestion}</TableHead>
            <TableHead hideOnMobile className="w-24">
              {dict.faq.colOrder}
            </TableHead>
            <TableHead className="w-32">{dict.faq.colStatus}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">
                <Link href={`/faq/${item.id}/edit`} className="hover:underline">
                  {item.question}
                </Link>
              </TableCell>
              <TableCell hideOnMobile className="text-muted-foreground">
                {item.sortOrder}
              </TableCell>
              <TableCell>
                <Badge variant={item.isActive ? "default" : "secondary"}>
                  {item.isActive
                    ? dict.faq.statusActive
                    : dict.faq.statusInactive}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/faq/${item.id}/edit`}>
                      {dict.common.edit}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => handleToggle(item)}
                  >
                    {item.isActive ? dict.faq.deactivate : dict.faq.activate}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => handleDelete(item)}
                  >
                    {dict.common.delete}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
