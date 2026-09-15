import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.staff;

const SKELETON_ROWS = 5;
const COLUMN_COUNT = 6;

/** Loading placeholder matching the `StaffTable` column structure. */
export function StaffTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{d.colPerson}</TableHead>
            <TableHead>{d.colLevel}</TableHead>
            <TableHead>{d.colPermissions}</TableHead>
            <TableHead>{d.colLastSeen}</TableHead>
            <TableHead>{d.colStatus}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <TableRow key={index}>
              {Array.from({ length: COLUMN_COUNT }).map((__, cell) => (
                <TableCell key={cell}>
                  <div className="h-4 w-full max-w-32 animate-pulse rounded bg-muted" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
