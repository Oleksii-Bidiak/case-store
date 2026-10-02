import { Skeleton } from "./skeleton";

/**
 * Stepper labels, sized like «Доставка», «Перевірка», «Підтвердження» so the
 * placeholder wraps onto a second row at the same widths the real stepper does.
 */
const STEP_LABEL_WIDTHS = ["w-16", "w-18", "w-28"] as const;

/**
 * A form field: the `text-sm` label line, a 36px input and, when the real field
 * has one, its `text-xs` hint line.
 */
function FieldSkeleton({
  label = "w-20",
  hint,
}: {
  label?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center">
        <Skeleton className={`h-4 ${label}`} />
      </div>
      <Skeleton className="h-9 w-full" />
      {hint && (
        <div className="flex h-4 items-center">
          <Skeleton className={`h-3 max-w-full ${hint}`} />
        </div>
      )}
    </div>
  );
}

/** A card's `text-lg` heading line (28px). */
function CardTitleSkeleton({
  width,
  legend = false,
}: {
  width: string;
  /** A fieldset `legend` sits `mb-2` above its fields; a card `h2`, `mb-4`. */
  legend?: boolean;
}) {
  return (
    <div className={`flex h-7 items-center ${legend ? "mb-2" : "mb-4"}`}>
      <Skeleton className={`h-5 ${width}`} />
    </div>
  );
}

/** A label + value line of the order summary (`py-1.5 text-sm`, 32px tall). */
function SummaryRow() {
  return (
    <div className="flex h-8 items-center justify-between">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

const CARD = "rounded-card border border-border bg-card p-6 shadow-card";

/**
 * CheckoutSkeleton — loading placeholder for `/checkout` (TASK-869). It is the
 * step-1 CheckoutView with the content blanked out, block for block: the
 * breadcrumb line (`mb-4`), the h1 slot (`mb-6`; two H1_CLASS lines below `sm`,
 * where «Оформлення замовлення» wraps, one from `sm`), the three-step stepper
 * (`mb-7`), then the same `[1fr_380px]` grid from `lg` — contact, address and
 * payment cards on the left, the order summary and the trust strip on the
 * right. Below `lg` they stack like the page.
 *
 * The contact card is the guest one: guest checkout is the default path, so a
 * signed-in shopper sees that one card drop away rather than every guest seeing
 * the form grow. The step's button is reserved from `md` only — below it the
 * button rides in the fixed pay bar, out of the flow.
 *
 * Lives in shared/ui so the checkout widget and the `/checkout` route share it
 * without a widget→widget import. Server-compatible.
 */
export function CheckoutSkeleton() {
  return (
    <div aria-hidden="true" data-testid="checkout-skeleton">
      {/* Breadcrumbs */}
      <div className="mb-4 flex h-5 items-center gap-1.5">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-20" />
      </div>

      {/* h1 «Оформлення замовлення» */}
      <div data-testid="checkout-skeleton-title" className="mb-6 flex flex-col">
        <div className="flex h-9 items-center md:h-10">
          <Skeleton className="h-7 w-56 sm:w-80 md:h-8 md:w-112" />
        </div>
        <div className="flex h-9 items-center sm:hidden">
          <Skeleton className="h-7 w-36" />
        </div>
      </div>

      {/* Stepper: Доставка — Перевірка — Підтвердження */}
      <div
        data-testid="checkout-skeleton-stepper"
        className="mb-7 flex flex-wrap items-center gap-2"
      >
        {STEP_LABEL_WIDTHS.map((width, i) => (
          <div key={width} className="flex items-center gap-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className={`h-4 ${width}`} />
            </div>
            {i < STEP_LABEL_WIDTHS.length - 1 && (
              <span className="h-px w-7 bg-border" />
            )}
          </div>
        ))}
      </div>

      <div
        data-testid="checkout-skeleton-grid"
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors CheckoutView's fixed+fluid column layout, which has no named grid-cols-N equivalent
        className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start"
      >
        {/* Form: contact, address, payment */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className={CARD}>
            <CardTitleSkeleton width="w-36" legend />
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <FieldSkeleton label="w-12" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>

          <div className={CARD}>
            <CardTitleSkeleton width="w-40" legend />
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSkeleton label="w-10" />
                <FieldSkeleton label="w-20" />
                <FieldSkeleton label="w-16" hint="w-48" />
                <FieldSkeleton label="w-14" />
              </div>
              <FieldSkeleton label="w-56" hint="w-80" />
              <div className="flex flex-col gap-1.5">
                <div className="flex h-5 items-center">
                  <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-16 w-full" />
                {/* «0/500» counter */}
                <div className="flex h-4 items-center justify-end">
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            </div>
          </div>

          <div className={CARD}>
            <CardTitleSkeleton width="w-24" />
            <Skeleton className="h-19 w-full rounded-cta" />
            <Skeleton className="mt-3.5 h-3 w-3/4" />
          </div>

          <Skeleton className="hidden h-10 w-20 md:block" />
        </div>

        {/* Aside: order summary + trust strip */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col rounded-card border border-border bg-card p-5.5 shadow-card">
            {/* «Ваше замовлення» */}
            <div className="mb-4 flex h-7 items-center">
              <Skeleton className="h-5 w-44" />
            </div>
            <div className="mb-4 flex items-center gap-3">
              <Skeleton className="size-12 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-14" />
            </div>
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
            <div className="mt-3 flex flex-col border-t border-border pt-3">
              <SummaryRow />
              <SummaryRow />
            </div>
            <div className="my-2.5 h-px bg-border" />
            {/* «До сплати» */}
            <div className="flex h-10 items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-32" />
            </div>
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
