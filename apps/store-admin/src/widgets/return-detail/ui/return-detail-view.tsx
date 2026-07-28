"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  returnStatusBadgeVariant,
  returnStatusLabel,
  useAdminReturnControllerFindById,
} from "@/entities/return";
import { ReturnResolveForm } from "@/features/return-resolve";
import {
  Badge,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { ReturnDetailSkeleton } from "./return-detail-skeleton";

interface ReturnDetailViewProps {
  returnId: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * One return in full, with the resolve action (TASK-340).
 *
 * The three timestamps are shown as three separate facts — asked, decided,
 * restocked — because they routinely happen days apart and an operator's first
 * question about a disputed return is which of them has already occurred.
 */
export function ReturnDetailView({ returnId }: ReturnDetailViewProps) {
  const router = useRouter();
  const { data, isLoading, isError, error } =
    useAdminReturnControllerFindById(returnId);

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/returns");
    }
  }, [isNotFound, router]);

  if (isLoading) {
    return <ReturnDetailSkeleton />;
  }

  if (isError && !isNotFound) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.returns.loadOneError}
      </p>
    );
  }

  const rma = data?.data;
  if (!rma) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/returns"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.returns.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.returns.title(rma.id.slice(0, 8))}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={returnStatusBadgeVariant(rma.status)}>
                {returnStatusLabel(rma.status)}
              </Badge>
              <Link
                href={`/orders/${rma.orderId}`}
                className="text-sm text-primary hover:underline"
              >
                {dict.returns.viewOrder} {rma.orderId.slice(0, 8)}…
              </Link>
            </div>
            <Separator />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {dict.returns.reason}
              </span>
              <p className="text-sm text-muted-foreground">
                {rma.reason ?? dict.returns.noReason}
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.returns.itemsHeading}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{dict.returns.itemProduct}</TableHead>
                  <TableHead className="text-right">
                    {dict.returns.itemQty}
                  </TableHead>
                  <TableHead className="text-right">
                    {dict.returns.itemPrice}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rma.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.price === null ? "—" : formatCurrency(item.price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.returns.resolveHeading}
            </h3>
            <ReturnResolveForm rma={rma} />
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2 rounded-md border border-border p-4">
            <DetailRow
              label={dict.returns.requestedAt}
              value={dateFormatter.format(new Date(rma.requestedAt))}
            />
            <DetailRow
              label={dict.returns.resolvedAt}
              value={
                rma.resolvedAt
                  ? dateFormatter.format(new Date(rma.resolvedAt))
                  : "—"
              }
            />
            <DetailRow
              label={dict.returns.restockedAt}
              value={
                rma.restockedAt
                  ? dateFormatter.format(new Date(rma.restockedAt))
                  : dict.returns.notRestocked
              }
            />
            <Separator />
            <DetailRow
              label={dict.returns.refundedAmount}
              // Null is not zero — see the list table's note.
              value={
                rma.refundedAmount === null
                  ? dict.returns.notRefunded
                  : formatCurrency(rma.refundedAmount)
              }
            />
          </section>

          {rma.operatorNotes ? (
            <section className="flex flex-col gap-1 rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {dict.returns.operatorNotes}
              </h3>
              <p className="text-sm text-muted-foreground">
                {rma.operatorNotes}
              </p>
              <p className="text-xs text-muted-foreground">
                {dict.returns.operatorNotesHint}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}
