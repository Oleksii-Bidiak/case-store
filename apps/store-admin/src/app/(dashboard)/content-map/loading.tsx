import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * `/content-map` loading (ContentMapProposal ДЩ4, канон 1.7): the real heading
 * and subheading, the tab row, then the schema column and zone cards as blocks
 * — the layout the page lands in, so nothing jumps.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.contentMap.heading}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {dict.contentMap.subheading}
        </p>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 shrink-0" />
        ))}
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <Skeleton className="h-11 md:h-105 md:w-75 md:shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-18" />
          ))}
        </div>
      </div>
    </div>
  );
}
