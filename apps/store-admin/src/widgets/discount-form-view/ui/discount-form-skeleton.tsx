import Link from "next/link";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Loading placeholder in the shape of the promo-code form (canon 1.7): the
 * back link and heading, the notice strip, four section cards on the left, the
 * cart preview on the right.
 */
export function DiscountFormSkeleton({ heading }: { heading?: string }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <div className="flex flex-col gap-1">
        <Link
          href="/discounts"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.discounts.back}
        </Link>
        {heading ? (
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {heading}
          </h2>
        ) : (
          <Skeleton className="h-8 w-56 max-w-full" />
        )}
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 lg:col-span-3">
          {[3, 1, 1, 2].map((lines, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
            >
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: lines }).map((_, line) => (
                <Skeleton key={line} className="h-10 w-full" />
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card lg:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
