import { Ban, Check } from "lucide-react";
import {
  orderTimelineStates,
  type OrderEntityStatus,
  type OrderTimelineStepState,
} from "@/entities/order";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

const DOT: Record<OrderTimelineStepState, string> = {
  done: "border-transparent bg-success/15 text-success",
  current: "border-primary bg-primary text-primary-foreground",
  next: "border-border bg-card text-muted-foreground",
};

/** The line leaving a stage: green once that stage is done. */
const lineColour = (state: OrderTimelineStepState | undefined) =>
  state === "done" ? "bg-success" : "bg-border";

interface OrderStatusTimelineProps {
  status: OrderEntityStatus;
  /** Formatted `createdAt` — the only stage date the API keeps. */
  placedOn: string;
}

/**
 * OrderStatusTimeline — «Оформлено → Підтверджено → Відправлено → Доставлено»
 * for an OPEN order (TASK-217, AccountOrders.dc.html `.ao-steps`).
 *
 * - done: a success-tint dot with a check, and a green line on to the next
 *   stage; current: the primary dot with its number, `aria-current="step"`;
 *   ahead: an outlined dot and a muted label. A screen reader hears the state
 *   in words («виконано», «ще попереду») — colour alone carries nothing.
 * - Below `sm` the stages stack (dot left, text right, a vertical line down to
 *   the next dot); from `sm` they sit in four columns joined by horizontal
 *   lines. Both are drawn by the same flex rail — two half-lines either side of
 *   each dot — so no arbitrary offsets are needed.
 *
 * Sub-lines: «Оформлено» always carries the order date (the mockup let PENDING
 * overwrite it — fixed here); a PENDING order adds «Очікує підтвердження» as
 * that stage's second line, since it is the current one; PROCESSING puts «В
 * обробці» under «Підтверджено».
 *
 * Renders nothing for a closed order — see {@link OrderClosedStrip}.
 */
export function OrderStatusTimeline({
  status,
  placedOn,
}: OrderStatusTimelineProps) {
  const states = orderTimelineStates(status);
  if (!states) return null;

  const t = dict.order.detail;
  const last = states.length - 1;

  const subLines = (index: number): string[] => {
    const lines: string[] = [];
    if (index === 0) lines.push(placedOn);
    // Only where the status says more than the stage name: PENDING →
    // «Очікує підтвердження», PROCESSING → «В обробці». SHIPPED under
    // «Відправлено» would just repeat it.
    if (
      states[index] === "current" &&
      (status === "PENDING" || status === "PROCESSING")
    ) {
      const label = dict.order.orderStatusLabels[status];
      if (label) lines.push(label);
    }
    return lines;
  };

  return (
    <div
      data-testid="order-timeline"
      className="rounded-card border border-border bg-card px-4 py-5 shadow-card sm:px-5"
    >
      <ol aria-label={t.stepsAria} className="flex flex-col sm:flex-row">
        {t.steps.map((label, index) => {
          const state = states[index];
          return (
            <li
              key={label}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className="flex gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
            >
              <span
                aria-hidden="true"
                className="flex flex-col items-center sm:w-full sm:flex-row sm:gap-1.5"
              >
                <span
                  className={cn(
                    "hidden h-0.5 flex-1 rounded-full sm:block",
                    index === 0 ? "invisible" : lineColour(states[index - 1]),
                  )}
                />
                <span
                  className={cn(
                    "inline-flex size-7.5 shrink-0 items-center justify-center rounded-full border-chip font-mono text-xs font-bold",
                    DOT[state],
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "hidden h-0.5 flex-1 rounded-full sm:block",
                    index === last ? "invisible" : lineColour(state),
                  )}
                />
                {index < last && (
                  <span
                    className={cn(
                      "my-1 w-0.5 flex-1 rounded-full sm:hidden",
                      lineColour(state),
                    )}
                  />
                )}
              </span>

              {/* The gap to the next stage is padding INSIDE the item (on the
                  text), not between items, so the stacked layout's vertical
                  line — which stretches with the item — runs on into it. */}
              <span
                className={cn(
                  "flex flex-col gap-0.5 pt-1.5 sm:items-center sm:pt-0",
                  index < last && "pb-3.5 sm:pb-0",
                )}
              >
                <span
                  className={cn(
                    "text-sm",
                    state === "next"
                      ? "font-medium text-muted-foreground"
                      : "font-semibold text-foreground",
                  )}
                >
                  {label}
                  {state !== "current" && (
                    <span className="sr-only">
                      {`, ${state === "done" ? t.stepDoneSr : t.stepNextSr}`}
                    </span>
                  )}
                </span>
                {subLines(index).map((line) => (
                  <span key={line} className="text-xs text-muted-foreground">
                    {line}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * OrderClosedStrip — what stands where the timeline would be on a CANCELLED or
 * REFUNDED order (AccountOrders.dc.html): a ban icon, «Замовлення скасовано» /
 * «Повернення коштів», and the order date. The date is `text-foreground`, not
 * muted: `muted-foreground` on `bg-muted` is 4.34:1, under the 4.5:1 floor; the
 * weight keeps the title first.
 */
export function OrderClosedStrip({
  status,
  placedOn,
}: OrderStatusTimelineProps) {
  const t = dict.order.detail;
  return (
    <div
      data-testid="order-closed-strip"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-menu bg-muted px-4 py-3.5 text-sm text-foreground"
    >
      <Ban className="size-4.5 shrink-0 text-destructive" aria-hidden="true" />
      <b className="font-semibold">
        {status === "REFUNDED" ? t.closedRefunded : t.closedCancelled}
      </b>
      <span>{t.placedOn(placedOn)}</span>
    </div>
  );
}
