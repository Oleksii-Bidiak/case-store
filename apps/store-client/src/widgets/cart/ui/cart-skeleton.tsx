import { Skeleton } from "@/shared/ui";

/** A label + value line of the summary card (`py-2 text-sm`, 36px tall). */
function SummaryRow() {
  return (
    <div className="flex h-9 items-center justify-between">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

/**
 * CartSkeleton — loading placeholder for `/cart` (TASK-869). It is the
 * populated CartView with the content blanked out, block for block: the
 * breadcrumb line, the h1 slot at H1_CLASS line heights (`h-9 md:h-10`), then
 * the same `[1fr_380px]` grid from `lg` — the line-items card (rows + the
 * «Додати ще товари / Очистити кошик» footer) and the aside with the summary
 * card and the trust strip. Below `lg` the two stack exactly like the page, so
 * neither the route `loading.tsx`, nor the `<Suspense>` fallback, nor
 * CartView's own loading branch jumps when the cart arrives.
 *
 * `p-5.5` is the cards' 22px padding on the spacing scale. Server-compatible.
 */
export function CartSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="cart-skeleton"
      className="flex flex-col gap-6"
    >
      {/* Breadcrumbs */}
      <div className="flex h-5 items-center gap-1.5">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-12" />
      </div>

      {/* h1 «Кошик · N тов.» */}
      <div
        data-testid="cart-skeleton-title"
        className="flex h-9 items-center md:h-10"
      >
        <Skeleton className="h-7 w-48 md:h-8 md:w-60" />
      </div>

      <div
        data-testid="cart-skeleton-grid"
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors CartView's fixed+fluid column layout, which has no named grid-cols-N equivalent
        className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start"
      >
        {/* Line items */}
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 border-b border-border p-5.5 md:gap-6"
            >
              <Skeleton className="size-24 shrink-0 rounded-cta" />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-3.5">
                  <div
                    data-testid="cart-skeleton-row-title"
                    className="flex min-w-0 flex-1 flex-col"
                  >
                    {/* Product name: 22px line boxes (the row's 15px title at
                        line-height 1.5). In the ~130px title column below md a
                        real name wraps to three lines; from md it is one. */}
                    <div className="flex h-5.5 items-center">
                      <Skeleton className="h-4 w-full md:w-3/4" />
                    </div>
                    <div className="flex h-5.5 items-center md:hidden">
                      <Skeleton className="h-4 w-full" />
                    </div>
                    <div className="flex h-5.5 items-center md:hidden">
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                    {/* «В наявності» — mb-1 + a 16px text-xs line */}
                    <div className="mt-1 flex h-4 items-center">
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="size-11 shrink-0 rounded-lg" />
                </div>
                {/* Stepper (118×38: two 36px buttons, the 44px field and the
                    border) + line total (28px). `flex-wrap` like the row: in
                    the narrow mobile column they stack, from md they share
                    a line. */}
                <div
                  data-testid="cart-skeleton-row-actions"
                  className="mt-auto flex flex-wrap items-end justify-between gap-3.5 pt-3"
                >
                  <Skeleton className="h-9.5 w-29.5 rounded-md" />
                  <Skeleton className="h-7 w-20" />
                </div>
              </div>
            </div>
          ))}
          <div className="flex h-13 items-center justify-between px-5.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>

        {/* Aside: summary card + trust strip */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col rounded-card border border-border bg-card p-5.5 shadow-card">
            {/* «Разом» */}
            <Skeleton className="mb-4 h-7 w-24" />
            {/* Promo code: label, field + button, hint */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 w-28" />
              </div>
              {/* The hint wraps onto two `text-sm` lines in the 380px aside */}
              <div className="flex flex-col gap-1 py-0.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="mt-2 flex flex-col">
              <SummaryRow />
              <SummaryRow />
            </div>
            <div className="my-2.5 h-px bg-border" />
            {/* «До сплати» */}
            <div className="mb-4.5 flex h-10 items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-11 w-full rounded-cta md:h-13" />
            <Skeleton className="mx-auto mt-3 h-3 w-56" />
          </div>

          <div className="flex flex-col gap-3 rounded-card border border-border bg-card px-5 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex h-5 items-center gap-3">
                <Skeleton className="size-5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
