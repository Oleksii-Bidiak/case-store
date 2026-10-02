import { cn } from "@/shared/lib/utils";
import { Skeleton } from "./skeleton";

/**
 * Stepper labels, sized like «Доставка», «Перевірка», «Підтвердження» so the
 * placeholder wraps onto a second row at the same widths the real stepper does.
 */
const STEP_LABEL_WIDTHS = ["w-16", "w-18", "w-28"] as const;

/**
 * One line box of muted copy: 20px for `text-sm`, 16px for `text-xs`, with a
 * bar inside. Copy that wraps on a phone is drawn as several of these, the
 * extra lines hidden from the breakpoint where the real text fits on one — a
 * single bar for a two-line hint is what made the form jump when it landed.
 */
function TextLine({
  size,
  width,
  className,
}: {
  size: "sm" | "xs";
  width: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center",
        size === "sm" ? "h-5" : "h-4",
        className,
      )}
    >
      <Skeleton
        className={cn("max-w-full", size === "sm" ? "h-3.5" : "h-3", width)}
      />
    </div>
  );
}

/**
 * A form field: the 14px label line (`Label` is `text-sm leading-none`), a 36px
 * input and, when the real field has one, its `text-xs` hint — `hintWraps` for
 * a hint that takes two lines below `sm`.
 */
function FieldSkeleton({
  label = "w-20",
  hint,
  hintWraps = false,
}: {
  label?: string;
  hint?: string;
  hintWraps?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-3.5 items-center">
        <Skeleton className={`h-3 ${label}`} />
      </div>
      <Skeleton className="h-9 w-full" />
      {hint && (
        <div className="flex flex-col">
          <TextLine size="xs" width={hint} />
          {hintWraps && (
            <TextLine size="xs" width="w-1/3" className="sm:hidden" />
          )}
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
          <div data-testid="checkout-skeleton-contact" className={CARD}>
            <CardTitleSkeleton width="w-36" legend />
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex h-3.5 items-center">
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-9 w-full" />
                {/* «Надішлемо підтвердження… Реєстрація не потрібна.» (text-sm):
                    two lines on a phone and in the narrow lg column, one at md
                    and from xl. */}
                <div className="flex flex-col">
                  <TextLine
                    size="sm"
                    width="w-full md:w-4/5 lg:w-full xl:w-4/5"
                  />
                  <TextLine
                    size="sm"
                    width="w-2/5"
                    className="md:hidden lg:flex xl:hidden"
                  />
                </div>
              </div>
              {/* «Для звʼязку використаємо…» (text-xs): two lines below sm. */}
              <div className="flex flex-col">
                <TextLine size="xs" width="w-full sm:w-3/5" />
                <TextLine size="xs" width="w-1/3" className="sm:hidden" />
              </div>
            </div>
          </div>

          <div className={CARD}>
            <CardTitleSkeleton width="w-40" legend />
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSkeleton label="w-10" />
              <FieldSkeleton label="w-20" />
              <FieldSkeleton label="w-16" hint="w-48" />
              <FieldSkeleton label="w-14" />
              <div className="sm:col-span-2">
                <FieldSkeleton label="w-56" hint="w-full sm:w-80" hintWraps />
              </div>
            </div>
            {/* Comment: `text-sm` label, textarea, «0/500» counter */}
            <div className="mt-4 flex flex-col gap-1">
              <div className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-64 max-w-full" />
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="flex h-4 items-center justify-end">
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </div>

          <div data-testid="checkout-skeleton-payment" className={CARD}>
            <CardTitleSkeleton width="w-24" />
            {/* One method tile: its note takes three lines on a phone. */}
            <Skeleton className="h-25.5 w-full rounded-cta sm:h-19.5" />
            {/* Manager note (text-xs): two lines below sm. */}
            <div className="mt-3.5 flex flex-col">
              <TextLine size="xs" width="w-full sm:w-3/4" />
              <TextLine size="xs" width="w-1/2" className="sm:hidden" />
            </div>
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
