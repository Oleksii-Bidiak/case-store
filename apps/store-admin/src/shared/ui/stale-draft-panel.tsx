"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "./button";

/** One field where the operator's draft and the colleague's save disagree. */
export interface StaleDraftRow {
  /** Form field name — handed back to `onTakeTheirs`. */
  name: string;
  /** The field's visible label; also names the row's group for a screen reader. */
  label: string;
  /** What the colleague saved. */
  theirs: string;
  /** What the operator has typed. */
  mine: string;
}

export interface StaleDraftPanelLabels {
  title: string;
  /** Lead-in above the rows, when there are rows. */
  diverging: string;
  /** Said instead of the rows when the colleague changed only other fields. */
  refreshed: string;
  theirs: string;
  mine: string;
  /** Shown in place of an empty value, so «nothing» reads as a value. */
  empty: string;
  takeTheirs: string;
  keepMine: string;
  acknowledge: string;
}

export interface StaleDraftPanelProps {
  rows: StaleDraftRow[];
  labels: StaleDraftPanelLabels;
  onTakeTheirs: (name: string) => void;
  /** «Переглянув — зберегти мою» / «Зрозуміло»: the operator has reviewed. */
  onAcknowledge: () => void;
}

/**
 * The colleague's version next to the operator's draft, after a save was
 * refused as stale (TASK-1972). Dumb: the decision logic lives in
 * `useStaleDraftReview`, the words come in through `labels`.
 *
 * A live region (`role="alert"`) because it appears as the answer to the
 * operator's click — it replaces the sticky error toast, so it must be
 * announced the way the toast was.
 *
 * It also takes focus when it appears (review R3): the click that raised it was
 * on «Зберегти», which the review now disables, so focus would otherwise fall
 * to the page body and a keyboard user would have to hunt for the decision.
 */
export function StaleDraftPanel({
  rows,
  labels,
  onTakeTheirs,
  onAcknowledge,
}: StaleDraftPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      data-slot="stale-draft-panel"
      className="flex flex-col gap-3 rounded-md border border-warning/35 bg-warning/8 p-3 text-sm text-foreground outline-none"
    >
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-warning"
        />
        <span>{labels.title}</span>
      </p>

      {rows.length > 0 ? (
        <>
          <p className="text-muted-foreground">{labels.diverging}</p>
          {rows.map((row) => (
            <div
              key={row.name}
              role="group"
              aria-label={row.label}
              className="flex flex-col gap-2 rounded-md border border-border bg-background p-2.5"
            >
              <p className="text-xs font-medium">{row.label}</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    {labels.theirs}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {row.theirs || labels.empty}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    {labels.mine}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {row.mine || labels.empty}
                  </dd>
                </div>
              </dl>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onTakeTheirs(row.name)}
                >
                  {labels.takeTheirs}
                </Button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="text-muted-foreground">{labels.refreshed}</p>
      )}

      <div>
        <Button type="button" size="sm" onClick={onAcknowledge}>
          {rows.length > 0 ? labels.keepMine : labels.acknowledge}
        </Button>
      </div>
    </div>
  );
}
