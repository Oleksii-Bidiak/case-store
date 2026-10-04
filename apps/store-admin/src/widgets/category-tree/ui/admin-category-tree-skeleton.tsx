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

/**
 * Loading placeholder for `AdminCategoryTree` (plan 158 §5, TASK-291-J; the
 * wave-198 layout, CategoriesProposal КТ1/КТ4).
 *
 * Same columns as the grid — selection | Назва | Slug | Товарів | Статус | ⋯ —
 * with the same three hidden below `md`, so the page does not jump sideways
 * when the tree lands.
 */
export function AdminCategoryTreeSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 max-md:px-3">
              <span className="sr-only">
                {dict.categories.tree.bulk.colSelect}
              </span>
            </TableHead>
            <TableHead className="max-md:px-2">
              {dict.categories.colName}
            </TableHead>
            <TableHead hideOnMobile>{dict.categories.colSlug}</TableHead>
            <TableHead hideOnMobile className="text-right">
              {dict.categories.colProducts}
            </TableHead>
            <TableHead hideOnMobile>{dict.categories.colStatus}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{dict.common.actions}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <TableRow key={index}>
              <TableCell className="w-10 max-md:px-3">
                <div className="size-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </TableCell>
              <TableCell className="max-md:px-2">
                <div
                  className="h-4 w-full max-w-48 animate-pulse rounded bg-muted motion-reduce:animate-none"
                  // Stagger so the placeholder reads as a tree, not a flat table.
                  style={{ marginInlineStart: (index % 3) * 24 }}
                />
              </TableCell>
              <TableCell hideOnMobile>
                <div className="h-4 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </TableCell>
              <TableCell hideOnMobile>
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </TableCell>
              <TableCell hideOnMobile>
                <div className="h-5 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
              </TableCell>
              <TableCell>
                <div className="ml-auto size-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
