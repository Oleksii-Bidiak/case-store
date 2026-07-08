const SKELETON_ROWS = 3;

/**
 * Loading placeholder for {@link OrderTimeline} — a short vertical list of
 * pulsing rows matching the timeline's shape (TASK-251).
 */
export function OrderTimelineSkeleton() {
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
        <li
          key={index}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}
