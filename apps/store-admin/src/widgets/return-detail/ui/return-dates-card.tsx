import { useId } from "react";
import type { ReturnEntity } from "@/entities/return";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";

const d = dict.returns;

/**
 * «Подано / Вирішено / Повернуто на склад» (TASK-1961, AD-RET-05/06) — three
 * facts that in real life are days apart, printed apart.
 *
 * «Вирішено» is `decidedAt`, the date of the CURRENT decision — not
 * `resolvedAt`, which is the last change of any kind and moves on every step.
 */
export function ReturnDatesCard({
  rma,
}: {
  rma: Pick<ReturnEntity, "requestedAt" | "decidedAt" | "restockedAt">;
}) {
  const headingId = useId();
  const rows: Array<{ term: string; value: string | null; empty: string }> = [
    { term: d.dateRequested, value: rma.requestedAt, empty: "" },
    { term: d.dateDecided, value: rma.decidedAt, empty: d.dateNotDecided },
    { term: d.restockedAt, value: rma.restockedAt, empty: d.notRestocked },
  ];

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border bg-card p-4 shadow-card"
    >
      <h3 id={headingId} className="sr-only">
        {d.datesAria}
      </h3>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.term} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{row.term}</dt>
            <dd
              className={cn(
                "tabular-nums",
                row.value ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {row.value ? formatDateTime(row.value) : row.empty}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
