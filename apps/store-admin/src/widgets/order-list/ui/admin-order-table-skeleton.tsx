import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.orders;

const SKELETON_ROWS = 5;

/** The registry's default columns, in order; the narrow ones hide below md. */
const COLUMNS: ReadonlyArray<{ label: string; mobile: boolean }> = [
  { label: d.colNumber, mobile: true },
  { label: d.colCreated, mobile: false },
  { label: d.colCustomer, mobile: true },
  { label: d.colStatus, mobile: true },
  { label: d.colPayment, mobile: false },
  { label: d.colDelivery, mobile: false },
  { label: d.colTotal, mobile: true },
  { label: d.colItemsShort, mobile: false },
];

const bar = "h-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none";

/**
 * Route / Suspense placeholder for `/orders`: the header, the toolbar's height
 * and the registry's columns — so the page does not jump when the list lands.
 */
export function AdminOrderTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <RegistryHeader title={d.heading} />
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-8 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="h-10 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none md:max-w-150"
      />
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-lg border shadow-card"
      >
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted">
            <tr className="border-b">
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  className={
                    column.mobile
                      ? "h-10 px-2 text-left font-medium"
                      : "hidden h-10 px-2 text-left font-medium md:table-cell"
                  }
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <tr key={row} className="border-b last:border-0">
                {COLUMNS.map((column) => (
                  <td
                    key={column.label}
                    className={
                      column.mobile
                        ? "px-2 py-3"
                        : "hidden px-2 py-3 md:table-cell"
                    }
                  >
                    <div className={bar} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
