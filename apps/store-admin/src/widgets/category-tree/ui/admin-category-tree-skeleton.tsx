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
const COLUMN_COUNT = 5;

/**
 * Loading placeholder for `AdminCategoryTree` (plan 158 §5, TASK-291-J).
 * Replaces `AdminCategoryTableSkeleton` — the tree has five columns
 * (Назва | Slug | Товари | Статус | Дії); Батьківська and Порядок are gone,
 * that information IS the tree now (§3.11).
 */
export function AdminCategoryTreeSkeleton() {
  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.categories.colName}</TableHead>
            <TableHead>{dict.categories.colSlug}</TableHead>
            <TableHead>{dict.categories.colProducts}</TableHead>
            <TableHead>{dict.categories.colStatus}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <TableRow key={index}>
              {Array.from({ length: COLUMN_COUNT }).map((__, cell) => (
                <TableCell key={cell}>
                  <div
                    className="h-4 w-full max-w-32 animate-pulse rounded bg-muted"
                    style={
                      // Stagger the first column so the placeholder reads as a
                      // tree rather than a flat table.
                      cell === 0
                        ? { marginInlineStart: (index % 3) * 24 }
                        : undefined
                    }
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
