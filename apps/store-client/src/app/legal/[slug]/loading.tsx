/**
 * Route-level loading UI for `/legal/[slug]`: a title bar plus a few content
 * placeholder lines, matching the article layout.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="mb-8 h-9 w-2/3 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-4 w-full animate-pulse rounded bg-muted last:w-1/2"
          />
        ))}
      </div>
    </div>
  );
}
