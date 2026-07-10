"use client";

import Link from "next/link";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Product-group list for the admin panel (TASK-142). Each group shows its axes
 * and how many positions belong to it, with a link to the edit form.
 */
export function AdminProductGroupTable() {
  const { data, isLoading, isError } = useProductGroupControllerFindAll();
  const groups = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-12 w-full animate-pulse rounded bg-muted"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.productGroups.loadError}
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.productGroups.empty}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.productGroups.colName}</TableHead>
            <TableHead hideOnMobile>{dict.productGroups.colAxes}</TableHead>
            <TableHead hideOnMobile>
              {dict.productGroups.colPositions}
            </TableHead>
            <TableHead>{dict.productGroups.colStatus}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell className="font-medium">{group.name}</TableCell>
              <TableCell hideOnMobile className="text-muted-foreground">
                {group.axes.length > 0
                  ? group.axes.map((axis) => axis.name).join(", ")
                  : "—"}
              </TableCell>
              <TableCell hideOnMobile>{group.positionCount}</TableCell>
              <TableCell className="text-muted-foreground">
                {group.isActive ? dict.common.active : dict.common.inactive}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/product-groups/${group.id}/edit`}>
                    {dict.common.edit}
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
