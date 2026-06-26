import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const SKELETON_ROWS = 5;
const COLUMN_COUNT = 7;

/**
 * Loading placeholder matching the AdminUserTable column structure.
 */
export function AdminUserTableSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>{dict.users.colEmail}</TableHead>
            <TableHead>{dict.users.colName}</TableHead>
            <TableHead>{dict.users.colRole}</TableHead>
            <TableHead>{dict.users.colStatus}</TableHead>
            <TableHead>{dict.users.colJoined}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <TableRow key={index}>
              {Array.from({ length: COLUMN_COUNT }).map((__, cell) => (
                <TableCell key={cell}>
                  <div className="h-4 w-full max-w-[8rem] animate-pulse rounded bg-muted" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
