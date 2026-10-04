import { dict } from "@/shared/config";

const d = dict.devices;

const SKELETON_ROWS = 8;

/** The registry's default columns, in order; the narrow ones hide below md. */
const COLUMNS: ReadonlyArray<{
  label: string;
  mobile: boolean;
  end?: boolean;
}> = [
  { label: d.colModel, mobile: true },
  { label: d.colBrand, mobile: false },
  { label: d.colYear, mobile: false },
  { label: d.colPages, mobile: false, end: true },
  { label: d.colStatus, mobile: true },
];

const bar = "h-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none";

/**
 * Suspense / route placeholder for the model registry (DevicesProposal ПР12):
 * the three quick views, the toolbar and the registry's columns — the same ones
 * the table draws (canon 1.7). The page draws the section header and tabs.
 */
export function DeviceModelTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
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
                      <div className="flex flex-col gap-1.5">
                        <div className={`${bar} w-36`} />
                        <div className={`${bar} h-3 w-20`} />
                      </div>
                    ) : (
                      <div
                        className={`${bar} ${column.end ? "ml-auto w-8" : "w-20"}`}
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
