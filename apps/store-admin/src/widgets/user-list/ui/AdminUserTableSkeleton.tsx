import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.users;

const SKELETON_ROWS = 5;

/**
 * Loading placeholder with the `AdminUserTable` columns (canon 1.7: the same
 * columns as the table, the phone hidden below md as the cards do).
 */
export function AdminUserTableSkeleton() {
  const columns: Array<{ label: string; hideOnMobile?: boolean }> = [
    { label: d.colCustomer },
    { label: d.colPhone, hideOnMobile: true },
    { label: d.colStatus },
    { label: d.colJoined, hideOnMobile: true },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.label} hideOnMobile={column.hideOnMobile}>
                {column.label}
              </TableHead>
            ))}
            <TableHead className="w-11">
              <span className="sr-only">{dict.common.actions}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell
                  key={column.label}
                  hideOnMobile={column.hideOnMobile}
                >
                  <div className="h-4 w-full max-w-32 animate-pulse rounded bg-muted" />
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
