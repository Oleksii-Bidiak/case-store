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
 * Loading placeholder matching the AdminCategoryTable column structure.
 */
export function AdminCategoryTableSkeleton() {
  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.categories.colName}</TableHead>
            <TableHead>{dict.categories.colSlug}</TableHead>
            <TableHead>{dict.categories.colParent}</TableHead>
            <TableHead>{dict.categories.colProducts}</TableHead>
            <TableHead>{dict.categories.colSort}</TableHead>
            <TableHead>{dict.categories.colStatus}</TableHead>
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
