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
// Title, slug, kind, status, actions. The kind column arrived with TASK-435 and
// the hand-typed «Порядок» column left with TASK-428, so neither side's number
// survived the merge; this has to agree with the header in `admin-page-table.tsx`
// or the skeleton stands in for a table of a different width.
const COLUMN_COUNT = 5;

/**
 * Loading placeholder matching the AdminPageTable column structure.
 */
export function AdminPageTableSkeleton() {
  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.pages.colTitle}</TableHead>
            <TableHead>{dict.pages.colKind}</TableHead>
            <TableHead>{dict.pages.colSlug}</TableHead>
            <TableHead>{dict.pages.colStatus}</TableHead>
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
