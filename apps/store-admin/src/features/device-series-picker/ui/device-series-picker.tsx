"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Input,
  SegmentedControl,
  Skeleton,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  groupBySeries,
  matchesSearch,
  partialSeriesReminders,
  seriesState,
  shortModelName,
  summarize,
  toNeedle,
  toggleSeries,
  type BrandGroup,
  type PickerBrand,
  type PickerModel,
  type SeriesGroup,
} from "../model/series";

const t = dict.seriesPicker;

export interface DeviceSeriesPickerProps {
  models: readonly PickerModel[];
  brands: readonly PickerBrand[];
  /** The selected model ids (controlled). */
  value: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Prefix for the chip checkbox ids — unique per picker on the page. */
  idPrefix: string;
  /** Show each model's product count on its chip (from `sm` up). */
  showCounts?: boolean;
  /** The «Обрано N моделей» line with «Очистити». */
  showSummary?: boolean;
  /** The «X не позначено» reminders for an almost-complete series. */
  showReminders?: boolean;
  isLoading?: boolean;
}

/**
 * DeviceSeriesPicker — device compatibility picked by SERIES (TASK-1955,
 * DeviceCompat artboards 1, 1m and 2): a tab per brand, a box per series with a
 * tri-state checkbox (tick = the whole series, dash = some of it), model chips
 * inside, a search across every brand, the summary line and the partial-series
 * reminder. Controlled and fetch-free: the product form and the bulk dialog own
 * the selection and the data.
 *
 * Models without a series are grouped under «Інші моделі».
 */
export function DeviceSeriesPicker({
  models,
  brands,
  isLoading = false,
  ...props
}: DeviceSeriesPickerProps) {
  const groups = useMemo(() => groupBySeries(models, brands), [models, brands]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <span className="sr-only">{t.loading}</span>
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.empty}</p>;
  }
  // The body seeds its open series and active brand from the selection once,
  // when it mounts with data — never again (docs/conventions/forms.md).
  return <PickerBody groups={groups} {...props} />;
}

interface PickerBodyProps extends Omit<
  DeviceSeriesPickerProps,
  "models" | "brands" | "isLoading"
> {
  groups: BrandGroup[];
}

function PickerBody({
  groups,
  value,
  onChange,
  idPrefix,
  showCounts = false,
  showSummary = true,
  showReminders = true,
}: PickerBodyProps) {
  const [activeBrand, setActiveBrand] = useState(
    () =>
      groups.find((brand) =>
        brand.series.some((group) => seriesState(group, value).selected > 0),
      )?.brandId ?? groups[0].brandId,
  );
  // Open at start: every series with a ticked model (the mockup: iPhone 15 and 14
  // open, 16 and 13 closed), and a brand's only group — a closed lone box hides
  // the whole brand behind one more click for nothing.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        groups.flatMap((brand) =>
          brand.series
            .filter(
              (group) =>
                brand.series.length === 1 ||
                seriesState(group, value).selected > 0,
            )
            .map((group) => group.key),
        ),
      ),
  );
  const [search, setSearch] = useState("");
  const needle = toNeedle(search);

  const toggleOpen = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleModel = (modelId: string, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(modelId);
    else next.delete(modelId);
    onChange(next);
  };

  // With a search, every brand is searched and only matching chips show.
  const visible: Array<{ group: SeriesGroup; models: PickerModel[] }> = needle
    ? groups.flatMap((brand) =>
        brand.series.flatMap((group) => {
          const seriesHit = (group.series ?? "")
            .toLocaleLowerCase("uk-UA")
            .includes(needle);
          const hits = seriesHit
            ? group.models
            : group.models.filter((model) => matchesSearch(model, needle));
          return hits.length > 0 ? [{ group, models: hits }] : [];
        }),
      )
    : (
        groups.find((brand) => brand.brandId === activeBrand) ?? groups[0]
      ).series.map((group) => ({ group, models: group.models }));

  const listedIds = useMemo(
    () =>
      new Set(
        groups.flatMap((brand) =>
          brand.series.flatMap((group) =>
            group.models.map((model) => model.id),
          ),
        ),
      ),
    [groups],
  );
  const selectedListed = [...value].filter((id) => listedIds.has(id)).length;
  const parts = showSummary ? summarize(groups, value) : [];
  const reminders = showReminders ? partialSeriesReminders(groups, value) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.lead}</p>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            variant="pill"
            aria-label={t.brandsAria}
            value={activeBrand}
            onValueChange={setActiveBrand}
            className="w-fit max-w-full self-start overflow-x-auto"
            options={groups.map((brand) => ({
              value: brand.brandId,
              label: (
                <>
                  {brand.brandName}
                  <Badge
                    variant="secondary"
                    className="hidden tabular-nums sm:inline-flex"
                  >
                    {brand.series.reduce(
                      (sum, group) => sum + group.models.length,
                      0,
                    )}
                  </Badge>
                </>
              ),
            }))}
          />
          <div className="relative min-w-50 flex-1 max-sm:basis-full">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label={t.searchAria}
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.nothingFound}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map(({ group, models: shown }) => (
            <SeriesBox
              key={group.key}
              group={group}
              shown={shown}
              value={value}
              isOpen={needle ? true : open.has(group.key)}
              onToggleOpen={() => toggleOpen(group.key)}
              onToggleSeries={() => onChange(toggleSeries(group, value))}
              onToggleModel={toggleModel}
              idPrefix={idPrefix}
              showCounts={showCounts}
            />
          ))}
        </div>
      )}

      {showSummary && selectedListed > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-pill">
          <b className="font-semibold">{t.summaryLead(selectedListed)}</b>
          {parts.map((part) => (
            <Badge
              key={part.key}
              variant="secondary"
              className="max-w-full truncate"
            >
              {part.whole && part.series
                ? t.summaryWhole(part.series, part.total)
                : part.names.join(", ")}
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            // Only the models this picker lists: a hidden model the product is
            // already linked to is not the operator's to clear from here.
            onClick={() =>
              onChange(new Set([...value].filter((id) => !listedIds.has(id))))
            }
          >
            {t.clear}
          </Button>
        </div>
      ) : null}

      {reminders.map((reminder) => (
        <Callout
          key={reminder.key}
          variant="warning"
          title={t.reminderTitle(reminder.missingModelName)}
        >
          <span className="text-pill">
            {t.reminderBody(reminder.series, reminder.selected, reminder.total)}
          </span>
        </Callout>
      ))}
    </div>
  );
}

interface SeriesBoxProps {
  group: SeriesGroup;
  /** The chips to draw — all of the series, or the search hits in it. */
  shown: PickerModel[];
  value: ReadonlySet<string>;
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleSeries: () => void;
  onToggleModel: (modelId: string, checked: boolean) => void;
  idPrefix: string;
  showCounts: boolean;
}

function SeriesBox({
  group,
  shown,
  value,
  isOpen,
  onToggleOpen,
  onToggleSeries,
  onToggleModel,
  idPrefix,
  showCounts,
}: SeriesBoxProps) {
  const bodyId = useId();
  const label = group.series ?? t.otherModels;
  const { selected, total, state } = seriesState(group, value);
  const stateText =
    state === "all"
      ? t.stateAll
      : state === "some"
        ? t.stateSome(selected, total)
        : t.stateNone(total);

  return (
    <div className="rounded-md border" data-series={group.series ?? ""}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold">
        <Checkbox
          checked={
            state === "all" ? true : state === "some" ? "indeterminate" : false
          }
          onCheckedChange={onToggleSeries}
          aria-label={t.seriesAria(label)}
        />
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span>{label}</span>
          <small className="text-xs font-normal text-muted-foreground">
            {stateText}
          </small>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              isOpen && "rotate-180",
            )}
          />
        </button>
      </div>
      {isOpen ? (
        <div
          id={bodyId}
          className="flex flex-wrap gap-1.5 border-t px-3 pt-2.5 pb-3 sm:pl-9.5"
        >
          {shown.map((model) => {
            const inputId = `${idPrefix}-${model.id}`;
            const checked = value.has(model.id);
            return (
              <label
                key={model.id}
                htmlFor={inputId}
                className={cn(
                  "inline-flex h-7.5 cursor-pointer items-center gap-2 rounded-full border bg-background pr-2.5 pl-2 text-pill has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  checked && "border-primary/50 bg-primary/8",
                )}
              >
                <Checkbox
                  id={inputId}
                  aria-label={model.name}
                  checked={checked}
                  onCheckedChange={(next) =>
                    onToggleModel(model.id, next === true)
                  }
                />
                <span aria-hidden="true">
                  {group.series === null ? model.name : shortModelName(model)}
                </span>
                {showCounts && model.productCount !== undefined ? (
                  <small
                    aria-hidden="true"
                    className="hidden text-xs text-muted-foreground tabular-nums sm:inline"
                  >
                    {model.productCount}
                  </small>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
