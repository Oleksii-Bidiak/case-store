import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const SKELETON_ROWS = 3;
// Seven since TASK-430 added the SKU column. A skeleton that is a column short
// makes the table jump sideways the moment the rows arrive.
const COLUMN_COUNT = 7;

/**
 * Loading placeholder matching the AdminReviewTable column structure.
 */
export function AdminReviewTableSkeleton() {
  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.reviews.colProduct}</TableHead>
            <TableHead>{dict.reviews.colSku}</TableHead>
            <TableHead>{dict.reviews.colAuthor}</TableHead>
            <TableHead>{dict.reviews.colRating}</TableHead>
            <TableHead>{dict.reviews.colComment}</TableHead>
            <TableHead>{dict.reviews.colDate}</TableHead>
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
