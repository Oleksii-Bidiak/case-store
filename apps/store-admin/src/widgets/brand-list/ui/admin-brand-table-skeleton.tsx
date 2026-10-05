import { dict } from "@/shared/config";

const d = dict.brands;

const SKELETON_ROWS = 8;

/** The registry's default columns, in order; the narrow ones hide below md. */
const COLUMNS: ReadonlyArray<{
  label: string;
  mobile: boolean;
  end?: boolean;
}> = [
  { label: d.colLogo, mobile: true },
  { label: d.colName, mobile: true },
  { label: d.colProducts, mobile: false, end: true },
  { label: d.colStatus, mobile: false },
];

const bar = "h-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none";

/**
 * Route / Suspense placeholder for `/brands` (BrandsProposal БР10): the real
 * heading and description, the three quick views, the toolbar's height and
 * the registry's columns — the same ones the table draws, so nothing jumps
 * when the list lands (canon 1.7).
 */
export function AdminBrandTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {d.heading}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {d.description}
        </p>
      </div>
      <div className="flex gap-2 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-8 w-28 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
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
                  className={[
                    "h-10 px-3 font-medium",
                    column.end ? "text-right" : "text-left",
                    column.mobile ? "" : "hidden md:table-cell",
                    column.label === d.colLogo ? "w-18" : "",
                  ].join(" ")}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <tr key={row} className="border-b last:border-0">
                {COLUMNS.map((column, index) => (
                  <td
                    key={column.label}
                    className={
                      column.mobile
                        ? "px-3 py-3"
                        : "hidden px-3 py-3 md:table-cell"
                    }
                  >
                    {index === 0 ? (
                      <div className="size-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                    ) : index === 1 ? (
                      <div className="flex flex-col gap-1.5">
                        <div className={`${bar} w-32`} />
                        <div className={`${bar} h-3 w-20`} />
                      </div>
                    ) : (
                      <div
                        className={`${bar} ${column.end ? "ml-auto w-8" : "w-24"}`}
                      />
                    )}
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
