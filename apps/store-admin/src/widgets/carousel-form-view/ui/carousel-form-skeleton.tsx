import Link from "next/link";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Loading placeholder in the shape of the carousel form (canon 1.7): the back
 * link and heading, then the «Основне», «Звідки товари» and «Публікація» cards.
 */
export function CarouselFormSkeleton({ heading }: { heading?: string }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-1">
        <Link
          href="/carousels"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.carousels.back}
        </Link>
        {heading ? (
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {heading}
          </h2>
        ) : (
          <Skeleton className="h-8 w-72 max-w-full" />
        )}
      </div>
      {[["h-10", "h-16"], ["h-16", "h-16"], ["h-9"]].map((rows, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
        >
          <Skeleton className="h-4 w-32" />
          {rows.map((height, row) => (
            <Skeleton key={row} className={`${height} w-full`} />
          ))}
        </div>
      ))}
    </div>
  );
}
