import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const c = dict.blogCategories;

const SKELETON_ROWS = 5;

const bar = "h-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none";

/**
 * Loading placeholder matching the BlogCategoryTable: the toolbar's height and
 * the grid's columns (Назва · На сайті · Статей · «⋯»), the narrow ones hidden
 * below md as in the grid (canon 1.7).
 */
export function BlogCategoryTableSkeleton({
  toolbar = true,
}: {
  /** `false` inside the grid, whose own toolbar is already on screen. */
  toolbar?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      {toolbar ? (
        <div
          aria-hidden="true"
          className="h-10 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none md:max-w-150"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-lg border border-border shadow-card"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{c.colName}</TableHead>
              <TableHead hideOnMobile>{c.colSite}</TableHead>
              <TableHead hideOnMobile>{c.colPosts}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className={`${bar} w-40`} />
                </TableCell>
                <TableCell hideOnMobile>
                  <div className={`${bar} w-48`} />
                </TableCell>
                <TableCell hideOnMobile>
                  <div className={`${bar} w-20`} />
                </TableCell>
                <TableCell>
                  <div className={`${bar} ml-auto w-6`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
