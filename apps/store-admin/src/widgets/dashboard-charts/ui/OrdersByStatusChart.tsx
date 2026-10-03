import type { OrderStatusCountDto } from "@/entities/dashboard";
import { OrderEntityStatus, orderStatusLabel } from "@/entities/order";
import { dict } from "@/shared/config";

interface OrdersByStatusChartProps {
  data: OrderStatusCountDto[];
}

/** Lifecycle order — the API groups by status and promises no order. */
const STATUS_ORDER: readonly string[] = Object.values(OrderEntityStatus);

function rank(status: string): number {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

/**
 * «Замовлення за статусом» as horizontal bars (TASK-1037, Dashboard П1).
 *
 * It was a recharts column chart whose X axis printed the raw enum (PENDING…)
 * rotated −30°: unreadable on 390 and not Ukrainian anywhere. A status
 * breakdown is a short ranked list, so it is drawn as one: the Ukrainian name,
 * a track with the share of the largest status, and the count — the number is
 * the answer, the bar only makes the proportion visible at a glance.
 *
 * Plain markup (no chart library, no client boundary): nothing here is
 * interactive and every value is already on screen.
 */
export function OrdersByStatusChart({ data }: OrdersByStatusChartProps) {
  const rows = [...data]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => rank(a.status) - rank(b.status));
  const max = rows.reduce((top, entry) => Math.max(top, entry.count), 0);

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {dict.dashboard.ordersByStatus}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.dashboard.noLastOrders}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((entry) => {
            const share = Math.round((1000 * entry.count) / max) / 10;
            return (
              <li
                key={entry.status}
                className="flex items-center gap-3 text-sm text-foreground"
              >
                <span className="w-33 shrink-0 truncate sm:w-42">
                  {orderStatusLabel(entry.status)}
                </span>
                <span
                  aria-hidden="true"
                  className="block h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    data-slot="bar-fill"
                    className="block h-full min-w-1 rounded-full bg-primary"
                    style={{ width: `${share}%` }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right font-medium tabular-nums sm:w-11">
                  {entry.count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
