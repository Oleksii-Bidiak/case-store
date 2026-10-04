import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.pages;
const SKELETON_ROWS = 8;
/** The registry's default columns, in order — see `page-registry-columns.tsx`. */
const COLUMNS = [d.colTitle, d.colSite, d.colKind, d.colStatus] as const;

/**
 * Loading placeholder for `/pages` (PagesProposal СР7, канон 1.7): the real
 * heading, the views and toolbar as blocks, and a table with the SAME column
 * headers the registry paints — so nothing jumps when the data lands.
 *
 * `withChrome={false}` is the in-widget variant: the widget already drew its
 * header and toolbar and only the table is still loading.
 */
export function AdminPageTableSkeleton({
  withChrome = true,
}: {
  withChrome?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {withChrome ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {d.heading}
            </h2>
            <Skeleton className="h-9 w-40" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-28 rounded-full" />
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 md:max-w-150" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="hidden h-9 w-26 md:block" />
          </div>
        </>
      ) : null}
      <div className="overflow-hidden rounded-lg border shadow-card">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted max-md:hidden">
            <tr className="border-b">
              {COLUMNS.map((label, index) => (
                <th
                  key={label}
                  className={
                    index === 0
                      ? "h-10 px-3 pl-10 text-left font-medium"
                      : "h-10 px-3 text-left font-medium"
                  }
                >
                  {label}
                </th>
              ))}
              <th className="w-11" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <tr key={row} className="border-b last:border-0">
                <td className="px-3 py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-4 shrink-0" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </td>
                <td className="px-3 py-4 max-md:hidden">
                  <Skeleton className="h-4 w-2/3" />
                </td>
                <td className="px-3 py-4 max-md:hidden">
                  <Skeleton className="h-5 w-20 rounded-full" />
                </td>
                <td className="px-3 py-4 max-md:hidden">
                  <Skeleton className="h-5 w-24 rounded-full" />
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
