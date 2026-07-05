"use client";

import { useRef } from "react";
import { Checkbox, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  DAY_LABELS_FULL,
  getDayIssue,
  isAllClosed,
  isModelValid,
  serializeWorkingHours,
  type DayHours,
  type DaySchedule,
  type WorkingHoursModel,
} from "../model/working-hours";

interface WorkingHoursEditorProps {
  model: WorkingHoursModel;
  onDayChange: (index: number, day: DaySchedule) => void;
}

const FALLBACK_HOURS: DayHours = { open: "09:00", close: "18:00" };

const ISSUE_MESSAGES = {
  missing: dict.siteContactForm.errors.workingHoursTimesRequired,
  order: dict.siteContactForm.errors.workingHoursCloseAfterOpen,
} as const;

/**
 * Presentational per-day working-hours editor. Fully controlled: the model
 * lives in the parent form; every change is reported via `onDayChange`.
 * Row-level validation issues and the live preview are pure derivations of
 * the model, so the component holds no synchronized state (forms.md Rule 1
 * does not apply). The only ref is a UX nicety: it remembers the hours of a
 * day toggled to «вихідний» so unchecking restores them.
 */
export function WorkingHoursEditor({
  model,
  onDayChange,
}: WorkingHoursEditorProps) {
  const t = dict.siteContactForm;
  const previousHoursRef = useRef<(DayHours | null)[]>(
    new Array<DayHours | null>(7).fill(null),
  );

  const valid = isModelValid(model);

  const toggleClosed = (index: number, closed: boolean) => {
    const current = model[index];
    if (closed) {
      previousHoursRef.current[index] = current;
      onDayChange(index, null);
    } else {
      onDayChange(index, previousHoursRef.current[index] ?? FALLBACK_HOURS);
    }
  };

  const changeTime = (index: number, field: keyof DayHours, value: string) => {
    const current = model[index];
    if (current === null) return;
    onDayChange(index, { ...current, [field]: value });
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-input p-4">
      {model.map((day, index) => {
        const dayLabel = DAY_LABELS_FULL[index];
        const closed = day === null;
        const issue = getDayIssue(day);
        const closedId = `wh-closed-${index}`;
        const errorId = issue ? `wh-error-${index}` : undefined;

        return (
          <div key={dayLabel} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                {dayLabel}
              </span>

              <span className="flex items-center gap-2">
                <Checkbox
                  id={closedId}
                  checked={closed}
                  aria-label={t.workingHoursClosedAria(dayLabel)}
                  onCheckedChange={(checked) =>
                    toggleClosed(index, checked === true)
                  }
                />
                <Label
                  htmlFor={closedId}
                  className="text-sm font-normal text-muted-foreground"
                >
                  {t.workingHoursClosed}
                </Label>
              </span>

              <span className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-28"
                  value={day?.open ?? ""}
                  disabled={closed}
                  aria-label={t.workingHoursOpenAria(dayLabel)}
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={errorId}
                  onChange={(e) => changeTime(index, "open", e.target.value)}
                />
                <span aria-hidden className="text-muted-foreground">
                  –
                </span>
                <Input
                  type="time"
                  className="w-28"
                  value={day?.close ?? ""}
                  disabled={closed}
                  aria-label={t.workingHoursCloseAria(dayLabel)}
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={errorId}
                  onChange={(e) => changeTime(index, "close", e.target.value)}
                />
              </span>
            </div>

            {issue && (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {ISSUE_MESSAGES[issue]}
              </p>
            )}
          </div>
        );
      })}

      <p className="border-t border-input pt-3 text-sm text-muted-foreground">
        {t.workingHoursPreview}{" "}
        {valid ? (
          <span className="font-medium text-foreground">
            {serializeWorkingHours(model)}
          </span>
        ) : (
          <span className="italic">{t.workingHoursPreviewInvalid}</span>
        )}
      </p>

      {isAllClosed(model) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t.workingHoursAllClosedWarning}
        </p>
      )}
    </div>
  );
}
