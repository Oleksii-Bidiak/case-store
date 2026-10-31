"use client";

import { useMemo, useState } from "react";
import { CheckIcon } from "lucide-react";
import {
  useDeviceControllerFindBrands,
  useDeviceControllerFindModels,
  type BulkCompatMode,
} from "@/entities/device";
import {
  DeviceSeriesPicker,
  groupBySeries,
  summarize,
  toBulkSelection,
} from "@/features/device-series-picker";
import {
  Button,
  Callout,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioCard,
  RadioCardGroup,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  compatSetLabel,
  groupCurrentCompat,
  previewCompat,
  type CompatRow,
} from "../model/preview";
import type { BulkCompatChange } from "../model/use-product-bulk-compat";

const t = dict.bulkCompat;

/** Same ceiling as the product form's picker (TASK-1134). */
const MODEL_LIMIT = 200;

const MODES: ReadonlyArray<{
  value: BulkCompatMode;
  title: string;
  description: string;
}> = [
  { value: "add", title: t.modeAdd, description: t.modeAddHint },
  { value: "remove", title: t.modeRemove, description: t.modeRemoveHint },
  { value: "replace", title: t.modeReplace, description: t.modeReplaceHint },
];

export interface BulkCompatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected products, with their current compat sets. */
  rows: readonly CompatRow[];
  isPending?: boolean;
  onConfirm: (change: BulkCompatChange) => void;
}

/**
 * «Сумісність для N товарів» (TASK-1955, DeviceCompat artboard 2): pick a mode
 * (Додати / Прибрати / Замінити) and models by series, see what would change,
 * apply to the whole selection in one request.
 *
 * The mockup crops the picker to two series without tabs or search; the full
 * picker is rendered in a scroll area, since other brands must stay reachable.
 */
export function BulkCompatDialog({
  open,
  onOpenChange,
  rows,
  isPending = false,
  onConfirm,
}: BulkCompatDialogProps) {
  const [mode, setMode] = useState<BulkCompatMode>("add");
  const [value, setValue] = useState<Set<string>>(() => new Set());
  const [openCount, setOpenCount] = useState(0);

  // Reset on the transition INTO open (docs/conventions/forms.md rule 1a): a
  // dialog that remembers last time's models would write them to the next
  // selection. The picker remounts too, so its tabs and search start clean.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode("add");
      setValue(new Set());
      setOpenCount((count) => count + 1);
    }
  }

  // Fetched only while the dialog is open.
  const { data: brandsData, isLoading: brandsLoading } =
    useDeviceControllerFindBrands({ query: { enabled: open } });
  const { data: modelsData, isLoading: modelsLoading } =
    useDeviceControllerFindModels(
      { limit: MODEL_LIMIT },
      { query: { enabled: open } },
    );
  const brands = useMemo(() => brandsData?.data ?? [], [brandsData]);
  const models = useMemo(() => modelsData?.data ?? [], [modelsData]);
  const groups = useMemo(() => groupBySeries(models, brands), [models, brands]);

  const listedIds = useMemo(() => new Set(models.map((m) => m.id)), [models]);
  const picked = useMemo(
    () => new Set([...value].filter((id) => listedIds.has(id))),
    [value, listedIds],
  );

  const count = rows.length;
  const current = groupCurrentCompat(rows);
  const currentParts = [
    ...(current.none > 0 ? [t.currentNone(current.none)] : []),
    ...current.groups.map((group) => t.currentGroup(group.count, group.label)),
    ...(current.more > 0 ? [t.currentMore(current.more)] : []),
  ];

  const pickedSummary = summarize(groups, picked)
    .map((part) =>
      part.whole && part.series
        ? t.wholeSeries(part.series)
        : part.names.join(", "),
    )
    .join(", ");
  const preview = previewCompat(mode, rows, picked);

  const previewText = (() => {
    if (picked.size === 0) return null;
    if (preview.changed === 0) return <>{t.previewNothing}</>;
    const lead = (
      <b className="font-semibold">{t.previewChanged(preview.changed)}</b>
    );
    if (mode === "add") {
      const keep =
        preview.keeping.length === 1
          ? ` ${t.previewKeepOne(compatSetLabel(preview.keeping[0].compatibleDeviceModels ?? []))}`
          : preview.keeping.length > 1
            ? ` ${t.previewKeepMany(preview.keeping.length)}`
            : "";
      return (
        <>
          {lead} {t.previewAdd(picked.size, pickedSummary)}
          {keep} {t.previewUndoAdd}
        </>
      );
    }
    if (mode === "remove") {
      return (
        <>
          {lead} {t.previewRemove(picked.size, pickedSummary)}{" "}
          {t.previewUndoRemove}
        </>
      );
    }
    return (
      <>
        {lead} {t.previewReplace(pickedSummary)} {t.previewReplaceNote}
      </>
    );
  })();

  const canApply = !isPending && picked.size > 0 && preview.changed > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-160">
        <DialogHeader>
          <DialogTitle>{t.title(count)}</DialogTitle>
          {currentParts.length > 0 ? (
            <DialogDescription>
              {t.currentLead} {currentParts.join(", ")}.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <RadioCardGroup
          aria-label={t.modeAria}
          value={mode}
          onValueChange={(next) => setMode(next as BulkCompatMode)}
          className="sm:grid-cols-3"
        >
          {MODES.map((option) => (
            <RadioCard
              key={option.value}
              value={option.value}
              title={option.title}
              description={option.description}
            />
          ))}
        </RadioCardGroup>

        <div
          role="group"
          aria-label={t.pickerAria}
          className="max-h-105 overflow-y-auto pr-1"
        >
          <DeviceSeriesPicker
            key={openCount}
            models={models}
            brands={brands}
            isLoading={brandsLoading || modelsLoading}
            value={value}
            onChange={setValue}
            idPrefix="bulk-compat"
            showSummary={false}
            showReminders={false}
          />
        </div>

        {previewText ? (
          <Callout
            variant="primary"
            icon={
              <CheckIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
            }
            className="text-pill leading-4.5"
          >
            <p data-testid="bulk-compat-preview">{previewText}</p>
          </Callout>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {dict.common.cancel}
          </Button>
          <Button
            type="button"
            disabled={!canApply}
            onClick={() =>
              onConfirm({ mode, ...toBulkSelection(groups, picked) })
            }
          >
            {t.apply(count)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
