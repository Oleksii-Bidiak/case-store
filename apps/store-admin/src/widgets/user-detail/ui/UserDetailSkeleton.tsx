/**
 * Loading placeholder for the user detail layout (main + sidebar columns).
 */
export function UserDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-48 w-full animate-pulse rounded bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="h-40 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
