"use client";

import { useId, useState, type FormEvent } from "react";

import { ReportPreset, type ReportPeriodEntity } from "@/entities/analytics";
import { dict } from "@/shared/config";
import { kyivToday } from "@/shared/lib/format";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  FieldError,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  useFilterDraft,
} from "@/shared/ui";
import {
  formatDayRangeDigits,
  formatPeriodLabel,
  formatPreviousLabel,
} from "../lib/format";
import {
  PRESET_OPTIONS,
  previousRangeOf,
  reportPeriodToUrl,
  validateCustomRange,
  type CustomRangeError,
  type ReportPeriodSelection,
} from "../model/report-period";

const d = dict.analytics;

const RANGE_ERROR_TEXT: Record<CustomRangeError, string> = {
  missing: d.rangeErrorMissing,
  order: d.rangeErrorOrder,
  future: d.rangeErrorFuture,
  tooLong: d.rangeErrorTooLong,
};

/** One segment of the preset switch (`.pb .seg span` in the artboard). */
const SEGMENT_CLASS = cn(
  "inline-flex min-h-11 shrink-0 items-center justify-center px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors motion-reduce:transition-none md:min-h-8",
  "hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
  "aria-pressed:bg-secondary aria-pressed:text-foreground data-[state=open]:text-foreground",
);

export interface PeriodBarProps {
  /** What the URL says (see `readReportPeriod`). */
  selection: ReportPeriodSelection;
  /**
   * The server's reading of that selection — actual days and the comparison
   * range. The label is drawn from it, never computed here, so the bar cannot
   * say one range while the reports count another.
   */
  period?: ReportPeriodEntity;
  /** The period is on its way — draw a placeholder, not a stale label. */
  periodLoading?: boolean;
}

/**
 * PeriodBar — the one period for all five reports (TASK-692, `.pb` in the
 * Analytics artboard): six presets, and on the right what the period is and
 * what it is compared with. Sticky from `md`, so the period stays in sight
 * wherever the owner has scrolled; static on a phone, where it would eat a
 * third of the screen.
 *
 * A preset is applied the moment it is pressed. «Довільно…» opens a small
 * form whose dates are a DRAFT (forms.md rule 1a, via `useFilterDraft`): it is
 * re-seeded from what is applied each time the popover opens, «Скасувати» and
 * Esc throw it away, and only «Показати» — after the same checks the API makes
 * — writes `preset=custom&from&to`.
 */
export function PeriodBar({
  selection,
  period,
  periodLoading,
}: PeriodBarProps) {
  const setUrlParams = useUrlParams();
  const today = kyivToday();
  const isCustom = selection.preset === ReportPreset.custom;

  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // The applied range: the URL's for `custom`; for a preset, the days the
  // server resolved it to — so «Довільно…» starts from what is on screen.
  const applied = isCustom
    ? { from: selection.from, to: selection.to }
    : { from: period?.from ?? "", to: period?.to ?? "" };
  const { draft, update } = useFilterDraft(applied, open);

  const ids = {
    title: useId(),
    from: useId(),
    to: useId(),
    hint: useId(),
    error: useId(),
  };

  const draftError = validateCustomRange(draft.from, draft.to, today);
  const shownError = submitted ? draftError : null;
  const previous = draftError ? null : previousRangeOf(draft.from, draft.to);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setSubmitted(false);
  }

  // Written even when the preset is already pressed: an invalid link falls
  // back to «30 днів» on screen while its junk is still in the address, and
  // pressing «30 днів» is how that address gets cleaned (a no-op otherwise).
  function choosePreset(preset: ReportPreset) {
    setUrlParams(reportPeriodToUrl({ preset, from: "", to: "" }));
  }

  // A preset's days come from the server; until they do, «Довільно…» would
  // open on empty fields and stay empty (the draft seeds on open only).
  const customUnready = !isCustom && !period && periodLoading;

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftError) {
      setSubmitted(true);
      return;
    }
    setUrlParams(
      reportPeriodToUrl({
        preset: ReportPreset.custom,
        from: draft.from,
        to: draft.to,
      }),
    );
    setOpen(false);
  }

  // Which field the error is about — the red ring goes where the fix is.
  const fromInvalid =
    shownError === "order" ||
    shownError === "tooLong" ||
    (shownError === "missing" && !draft.from);
  const toInvalid =
    shownError === "order" ||
    shownError === "tooLong" ||
    shownError === "future" ||
    (shownError === "missing" && Boolean(draft.from));
  const describedBy = (invalid: boolean) =>
    invalid ? `${ids.hint} ${ids.error}` : ids.hint;

  return (
    <div
      data-slot="period-bar"
      className="z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-2.5 shadow-card md:sticky md:top-0"
    >
      <div
        role="group"
        aria-label={d.periodAria}
        className="flex max-w-full overflow-x-auto rounded-md border"
      >
        {PRESET_OPTIONS.filter(({ id }) => id !== ReportPreset.custom).map(
          ({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={selection.preset === id}
              onClick={() => choosePreset(id)}
              className={SEGMENT_CLASS}
            >
              {label}
            </button>
          ),
        )}
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-pressed={isCustom}
              disabled={customUnready}
              className={cn(SEGMENT_CLASS, "disabled:opacity-50")}
            >
              {d.presetCustom}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-labelledby={ids.title}
            className="w-90 max-w-(--radix-popover-content-available-width) p-3.5"
          >
            <form
              noValidate
              onSubmit={applyCustom}
              className="flex flex-col gap-3"
            >
              <p
                id={ids.title}
                className="text-sm font-semibold text-foreground"
              >
                {d.customTitle}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={ids.from}>{d.customFrom}</Label>
                  <Input
                    id={ids.from}
                    type="date"
                    value={draft.from}
                    max={draft.to && draft.to < today ? draft.to : today}
                    onChange={(event) => update({ from: event.target.value })}
                    aria-invalid={fromInvalid || undefined}
                    aria-describedby={describedBy(fromInvalid)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={ids.to}>{d.customTo}</Label>
                  <Input
                    id={ids.to}
                    type="date"
                    value={draft.to}
                    min={draft.from || undefined}
                    max={today}
                    onChange={(event) => update({ to: event.target.value })}
                    aria-invalid={toInvalid || undefined}
                    aria-describedby={describedBy(toInvalid)}
                  />
                </div>
              </div>
              <p id={ids.hint} className="text-xs text-muted-foreground">
                {previous
                  ? `${d.customCompare(
                      previous.days,
                      formatDayRangeDigits(previous.from, previous.to),
                    )} `
                  : null}
                {d.customShare}
              </p>
              <FieldError id={ids.error}>
                {shownError ? RANGE_ERROR_TEXT[shownError] : null}
              </FieldError>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 md:min-h-8"
                  onClick={() => setOpen(false)}
                >
                  {d.customCancel}
                </Button>
                <Button type="submit" size="sm" className="min-h-11 md:min-h-8">
                  {d.customApply}
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      {/* Polite live region: a new period is announced once the server has
          said what it is, not while it is being asked. */}
      <div
        aria-live="polite"
        className="flex min-w-0 flex-col gap-px text-sm"
        data-slot="period-label"
      >
        {period ? (
          <>
            <span className="font-semibold text-foreground">
              {formatPeriodLabel(period)}
            </span>
            <span className="text-xs text-muted-foreground">
              {d.comparedWith(formatPreviousLabel(period))}
            </span>
          </>
        ) : periodLoading ? (
          <>
            <Skeleton aria-hidden="true" className="h-4 w-56" />
            <Skeleton aria-hidden="true" className="mt-1 h-3 w-72 max-w-full" />
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{d.kyivDay}</span>
        )}
      </div>
    </div>
  );
}
