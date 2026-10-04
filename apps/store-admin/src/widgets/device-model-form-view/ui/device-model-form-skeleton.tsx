import { dict } from "@/shared/config";

const block = "animate-pulse rounded-md bg-muted motion-reduce:animate-none";

/**
 * Route / Suspense placeholder for the device-model form (DevicesProposal
 * ПР12): the real «← Пристрої · Моделі» and a heading bar, then the three
 * section cards and — on the edit page — the side panel, in the form's grid.
 */
export function DeviceModelFormSkeleton({
  withAside = false,
}: {
  withAside?: boolean;
}) {
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
      </div>
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the form's fixed+fluid grid */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4" aria-hidden="true">
          {[4, 4, 1].map((rows, card) => (
            <div
              key={card}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
            >
              <div className={`${block} h-4 w-40`} />
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className={`${block} h-10 w-full`} />
              ))}
            </div>
          ))}
        </div>
        {withAside ? (
          <div
            aria-hidden="true"
            className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
          >
            {Array.from({ length: 2 }, (_, row) => (
              <div key={row} className={`${block} h-4 w-full`} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
