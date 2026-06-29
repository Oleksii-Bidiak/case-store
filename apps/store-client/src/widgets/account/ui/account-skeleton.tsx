import { Skeleton } from "@/shared/ui";

/**
 * AccountSkeleton — loading placeholder matching the AccountView layout
 * (heading + profile form card). Server-compatible; used both as the
 * `/account` route `loading.tsx` and the page's `<Suspense>` fallback so
 * navigation and initial render show identical UI.
 */
export function AccountSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-24" />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border p-6 shadow-card">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
