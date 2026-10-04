import Link from "next/link";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Loading placeholder in the shape of the banner form (canon 1.7): the back
 * link and heading, the section cards on the left, the preview on the right.
 */
export function BannerFormSkeleton({ heading }: { heading?: string }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-1">
        <Link
          href="/banners"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.banners.back}
        </Link>
        {heading ? (
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {heading}
          </h2>
        ) : (
          <Skeleton className="h-8 w-72 max-w-full" />
        )}
      </div>
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- same fixed+fluid columns as the form */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-6">
        <div className="flex flex-col gap-4">
          {[3, 2, 2, 2].map((lines, index) => (
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
        <Skeleton className="hidden aspect-banner-hero w-full rounded-2xl md:block" />
      </div>
    </div>
  );
}
