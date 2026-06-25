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
        Failed to load product groups. Please try again.
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        No product groups yet. Create your first group.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Axes</TableHead>
            <TableHead>Positions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell className="font-medium">{group.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {group.axes.length > 0
                  ? group.axes.map((axis) => axis.name).join(", ")
                  : "—"}
              </TableCell>
              <TableCell>{group.positionCount}</TableCell>
              <TableCell className="text-muted-foreground">
                {group.isActive ? "Active" : "Inactive"}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/product-groups/${group.id}/edit`}>Edit</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
