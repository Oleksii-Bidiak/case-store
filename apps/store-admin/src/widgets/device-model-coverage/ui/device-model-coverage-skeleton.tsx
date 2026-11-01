import { dict } from "@/shared/config";

const block = "animate-pulse rounded-md bg-muted motion-reduce:animate-none";

/**
 * Route / Suspense placeholder for the device-model coverage page (TASK-1955):
 * the real back link, a heading bar, three stat cards and table rows.
 */
export function DeviceModelCoverageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">
          {dict.devices.backToModels}
        </span>
        <div aria-hidden="true" className={`${block} h-8 w-56`} />
        <div aria-hidden="true" className={`${block} h-4 w-72`} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((card) => (
          <div
            key={card}
            className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5 shadow-card"
          >
            <div className={`${block} h-3 w-24`} />
            <div className={`${block} h-7 w-12`} />
          </div>
        ))}
      </div>
      <div
        className="flex flex-col gap-2 rounded-lg border bg-card p-5 shadow-card"
        aria-hidden="true"
      >
        <div className={`${block} h-5 w-56`} />
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className={`${block} h-9 w-full`} />
        ))}
      </div>
    </div>
  );
}
