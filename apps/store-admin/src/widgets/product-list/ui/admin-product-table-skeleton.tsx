import { dict } from "@/shared/config";

const SKELETON_ROWS = 6;
const COLUMNS = [
  dict.products.colPhoto,
  dict.products.colName,
  dict.products.colCategory,
  dict.products.colPrice,
  dict.products.colStock,
  dict.products.colStatus,
  dict.products.colUpdated,
];

const bar = "animate-pulse rounded-sm bg-muted motion-reduce:animate-none";

/**
 * Loading placeholder in the registry's shape (ProductsProposal Т1): the real
 * heading, the quick-view pills, the toolbar and the table — so nothing jumps
 * when the data lands.
 */
export function AdminProductTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {dict.products.heading}
      </h2>
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={`h-8 w-24 rounded-full ${bar}`} />
        ))}
      </div>
      <div className="flex gap-2">
        <div className={`h-9 flex-1 md:max-w-150 ${bar}`} />
        <div className={`h-9 w-24 ${bar}`} />
        <div className={`h-9 w-24 max-md:hidden ${bar}`} />
      </div>
      <div className="overflow-hidden rounded-lg border shadow-card">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted">
            <tr className="border-b">
              {COLUMNS.map((label, index) => (
                <th
                  key={label}
                  className={`h-10 px-2 text-left font-medium ${index > 1 ? "max-md:hidden" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <tr key={row} className="border-b last:border-0">
                {COLUMNS.map((label, index) => (
                  <td
                    key={label}
                    className={`px-2 py-3 ${index > 1 ? "max-md:hidden" : ""}`}
                  >
                    <div
                      className={index === 0 ? `size-10 ${bar}` : `h-4 ${bar}`}
                    />
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
