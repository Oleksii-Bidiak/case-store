import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const d = dict.devices;

/**
 * The «Пристрої» header in a loading state (DevicesProposal ПР12): the real
 * heading, description and tab labels — no counts and no CTA, which need the
 * session and the API. Static, so `loading.tsx` can render it on the server.
 */
export function DeviceSectionHeaderSkeleton({
  active,
}: {
  active: "brands" | "models";
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.nav.devices}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {d.sectionDescription}
        </p>
      </div>
      <div
        aria-hidden="true"
        className="flex gap-1 border-b border-border text-sm font-medium"
      >
        {(
          [
            ["brands", d.tabBrands],
            ["models", d.tabModels],
          ] as const
        ).map(([id, label]) => (
          <span
            key={id}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 md:min-h-10",
              id === active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
