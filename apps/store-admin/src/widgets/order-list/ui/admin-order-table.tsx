"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  OrderEntityStatus,
  orderStatusBadgeVariant,
  paymentStatusBadgeVariant,
  useAdminOrderControllerFindAll,
} from "@/entities/order";
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
import { AdminOrderTableSkeleton } from "./admin-order-table-skeleton";

const PAGE_SIZE = 20;
const ALL_OPTION = "__all__";

const STATUS_FILTER_OPTIONS = [
  OrderEntityStatus.PENDING,
  OrderEntityStatus.CONFIRMED,
  OrderEntityStatus.PROCESSING,
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
  OrderEntityStatus.CANCELLED,
  OrderEntityStatus.REFUNDED,
];

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Paginated order table for the admin panel, listing orders across all users.
 *
 * Status filter and page state live in the URL (`?status=`, `?page=`). The order
 * and customer IDs are shown truncated; full detail is one click away.
 */
export function AdminOrderTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const { data, isLoading, isError } = useAdminOrderControllerFindAll({
    page,
    limit: PAGE_SIZE,
    status: statusParam
      ? (statusParam as (typeof OrderEntityStatus)[keyof typeof OrderEntityStatus])
      : undefined,
  });

  const orders = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

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
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const handleStatusChange = (value: string) => {
    updateParams({
      status: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Select
          value={statusParam || ALL_OPTION}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger
            className="w-48"
            aria-label={dict.orders.filterStatusAria}
          >
            <SelectValue placeholder={dict.orders.allStatuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>
              {dict.orders.allStatuses}
            </SelectItem>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <AdminOrderTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.orders.loadError}
        </p>
      ) : orders.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {statusParam
            ? dict.orders.emptyStatus(statusParam)
            : dict.orders.empty}
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.orders.colOrder}</TableHead>
                <TableHead>{dict.orders.colCustomer}</TableHead>
                <TableHead>{dict.orders.colStatus}</TableHead>
                <TableHead>{dict.orders.colPayment}</TableHead>
                <TableHead>{dict.orders.colTotal}</TableHead>
                <TableHead>{dict.orders.colItems}</TableHead>
                <TableHead>{dict.orders.colCreated}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">
                    {order.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell>
                    {order.customer ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">{order.customer.email}</span>
                        {(order.customer.firstName ||
                          order.customer.lastName) && (
                          <span className="text-xs text-muted-foreground">
                            {[order.customer.firstName, order.customer.lastName]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {order.userId.slice(0, 8)}…
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderStatusBadgeVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={paymentStatusBadgeVariant(order.paymentStatus)}
                    >
                      {order.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {moneyFormatter.format(Number(order.total))}
                  </TableCell>
                  <TableCell>{order.items.length}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormatter.format(new Date(order.createdAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orders/${order.id}`}>
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

      {!isLoading && !isError && orders.length > 0 && (
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
