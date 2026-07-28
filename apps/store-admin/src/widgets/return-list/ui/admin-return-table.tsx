"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ReturnEntityStatus,
  returnStatusBadgeVariant,
  returnStatusLabel,
  useAdminReturnControllerFindAll,
  type AdminReturnControllerFindAllParams,
} from "@/entities/return";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { AdminReturnTableSkeleton } from "./admin-return-table-skeleton";

const PAGE_SIZE = 20;
const ALL_OPTION = "__all__";

const STATUS_FILTER_OPTIONS = [
  ReturnEntityStatus.REQUESTED,
  ReturnEntityStatus.APPROVED,
  ReturnEntityStatus.RECEIVED,
  ReturnEntityStatus.REFUNDED,
  ReturnEntityStatus.REJECTED,
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The returns queue (TASK-340).
 *
 * Filter and page live in the URL, like every other admin list, so a shared link
 * lands on the same view. Refunded amount is shown in the list rather than only
 * on the detail page: "how much money went back this week" is the question this
 * table is opened to answer.
 */
export function AdminReturnTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const { data, isLoading, isFetching, isError } =
    useAdminReturnControllerFindAll({
      page,
      limit: PAGE_SIZE,
      status:
        (statusParam as AdminReturnControllerFindAllParams["status"]) ||
        undefined,
    });

  const returns = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Select
          value={statusParam || ALL_OPTION}
          onValueChange={(value) =>
            updateParams({
              status: value === ALL_OPTION ? undefined : value,
              page: undefined,
            })
          }
        >
          <SelectTrigger
            className="w-56"
            aria-label={dict.returns.filterStatusAria}
          >
            <SelectValue placeholder={dict.returns.allStatuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>
              {dict.returns.allStatuses}
            </SelectItem>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {returnStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <AdminReturnTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.returns.loadError}
        </p>
      ) : returns.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {statusParam
            ? dict.returns.emptyStatus(returnStatusLabel(statusParam))
            : dict.returns.empty}
        </div>
      ) : (
        <div className="relative rounded-lg border border-border shadow-card overflow-hidden">
          {isFetching && !isLoading && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
            >
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
          <Table layout="card">
            <TableHeader>
              <TableRow>
                <TableHead>{dict.returns.colReturn}</TableHead>
                <TableHead>{dict.returns.colOrder}</TableHead>
                <TableHead>{dict.returns.colStatus}</TableHead>
                <TableHead>{dict.returns.colItems}</TableHead>
                <TableHead>{dict.returns.colRefunded}</TableHead>
                <TableHead>{dict.returns.colRequested}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((item) => (
                <TableRow
                  key={item.id}
                  rowLabel={dict.returns.rowAria(item.id.slice(0, 8))}
                >
                  <TableCell
                    label={dict.returns.colReturn}
                    className="font-mono text-xs"
                  >
                    {item.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell label={dict.returns.colOrder}>
                    <Link
                      href={`/orders/${item.orderId}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {item.orderId.slice(0, 8)}…
                    </Link>
                  </TableCell>
                  <TableCell label={dict.returns.colStatus}>
                    <Badge variant={returnStatusBadgeVariant(item.status)}>
                      {returnStatusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell label={dict.returns.colItems}>
                    {item.items.length}
                  </TableCell>
                  <TableCell label={dict.returns.colRefunded}>
                    {/* Null is not zero: "nothing has been refunded yet" and
                        "we refunded 0 ₴" are different facts. */}
                    {item.refundedAmount === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatCurrency(item.refundedAmount)
                    )}
                  </TableCell>
                  <TableCell
                    label={dict.returns.colRequested}
                    className="text-muted-foreground"
                  >
                    {dateFormatter.format(new Date(item.requestedAt))}
                  </TableCell>
                  <TableCell
                    label={dict.common.actions}
                    className="text-right max-md:text-left"
                  >
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/returns/${item.id}`}>
                        {dict.common.view}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && returns.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {dict.common.pageOf(page, totalPages)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                updateParams({
                  page: page - 1 <= 1 ? undefined : String(page - 1),
                })
              }
            >
              {dict.common.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {dict.common.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
