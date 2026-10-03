"use client";

import { useRef } from "react";
import { Input, Switch } from "@/shared/ui";
import { cn } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  DAY_LABELS_FULL,
  DAY_LABELS_SHORT,
  getDayIssue,
  isAllClosed,
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
 * Row-level validation issues are pure derivations of the model, so the
 * component holds no synchronized state (forms.md Rule 1 does not apply). The
 * only ref is a UX nicety: it remembers the hours of a day switched to
 * «Вихідний» so switching it back restores them.
 *
 * TASK-1053 (Н1): a day is a switch «Працюємо / Вихідний» — ON is a working
 * day, which is how the owner thinks about it — and a day off has no time
 * fields at all instead of two greyed-out ones. The live preview moved out to
 * the form's «Так побачать на сайті» aside.
 */
export function WorkingHoursEditor({
  model,
  onDayChange,
}: WorkingHoursEditorProps) {
  const t = dict.siteContactForm;
  const previousHoursRef = useRef<(DayHours | null)[]>(
    new Array<DayHours | null>(7).fill(null),
  );

  const setOpen = (index: number, open: boolean) => {
    const current = model[index];
    if (!open) {
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
    <div className="flex flex-col gap-2">
      {model.map((day, index) => {
        const dayLabel = DAY_LABELS_FULL[index];
        const open = day !== null;
        const issue = getDayIssue(day);
        const switchId = `wh-open-${index}`;
        const errorId = issue ? `wh-error-${index}` : undefined;

        return (
          <div key={dayLabel} className="flex flex-col gap-1">
            <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
              <span
                aria-hidden="true"
                className="w-8 shrink-0 text-sm font-semibold text-foreground"
              >
                {DAY_LABELS_SHORT[index]}
              </span>

              <span className="flex w-36 shrink-0 items-center gap-2">
                <Switch
                  id={switchId}
                  checked={open}
                  aria-label={t.workingHoursOpenDayAria(dayLabel)}
                  onCheckedChange={(checked) => setOpen(index, checked)}
                />
                <label
                  htmlFor={switchId}
                  aria-hidden="true"
                  className={cn(
                    "text-sm",
                    open ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {open ? t.workingHoursOpen : t.workingHoursClosed}
                </label>
              </span>

              {day !== null ? (
                <span className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="w-28"
                    value={day.open}
                    aria-label={t.workingHoursOpenAria(dayLabel)}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={errorId}
                    onChange={(e) => changeTime(index, "open", e.target.value)}
                  />
                  <span aria-hidden className="text-muted-foreground">
                    —
                  </span>
                  <Input
                    type="time"
                    className="w-28"
                    value={day.close}
                    aria-label={t.workingHoursCloseAria(dayLabel)}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={errorId}
                    onChange={(e) => changeTime(index, "close", e.target.value)}
                  />
                </span>
              ) : null}
            </div>

            {issue && (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {ISSUE_MESSAGES[issue]}
              </p>
            )}
          </div>
        );
      })}

      {isAllClosed(model) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t.workingHoursAllClosedWarning}
        </p>
      )}
    </div>
  );
}
