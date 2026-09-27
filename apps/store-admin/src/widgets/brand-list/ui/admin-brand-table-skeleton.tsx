import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const SKELETON_ROWS = 6;
const COLUMN_COUNT = 6;

/**
 * Loading placeholder matching the AdminBrandTable column structure (logo and
 * product-count columns since TASK-840).
 */
export function AdminBrandTableSkeleton() {
  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{dict.brands.colLogo}</TableHead>
            <TableHead>{dict.brands.colName}</TableHead>
            <TableHead>{dict.brands.colSlug}</TableHead>
            <TableHead className="text-right">
              {dict.brands.colProducts}
            </TableHead>
            <TableHead>{dict.brands.colStatus}</TableHead>
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
