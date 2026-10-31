"use client";

import { useMemo, useState } from "react";
import { Check, Smartphone, Tablet, Watch } from "lucide-react";

import {
  getDeviceFamilyHoverSurface,
  getDeviceFamilyTone,
  type DeviceFamily,
} from "@/entities/device";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";

import {
  POPULAR_TILE_COUNT,
  familiesPresent,
  groupBySeries,
  popularModels,
  type PickerModel,
} from "../model/picker-models";
import { FOCUS_RING, KICKER, deviceGlyph } from "./picker-styles";

const t = dict.devicePicker.dialog;
const POPULAR_TAB = "popular";

interface ModelBrowserProps {
  models: readonly PickerModel[];
  savedIds: ReadonlySet<string>;
  /** Preset tab from the open request (falls back to «Популярні»). */
  initialFamily?: DeviceFamily;
  onChoose: (model: PickerModel) => void;
}

/**
 * The model list is not there yet: a tile-shaped skeleton (browse mode) or a
 * one-line status (search mode, `compact`) — or the error with a retry.
 */
export function CatalogStatus({
  isError,
  onRetry,
  compact,
}: {
  isError: boolean;
  onRetry: () => void;
  compact: boolean;
}) {
  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-pad bg-muted p-4 text-sm"
      >
        <p className="text-muted-foreground">{t.loadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t.retry}
        </Button>
      </div>
    );
  }

  if (compact) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t.loading}
      </p>
    );
  }

  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only" role="status">
        {t.loading}
      </span>
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: POPULAR_TILE_COUNT }, (_, i) => (
          <Skeleton key={i} className="min-h-29 rounded-card" />
        ))}
      </div>
    </div>
  );
}

/**
 * Browse mode (empty query): «Популярні» tiles + one tab per device family
 * with the family's models as chips grouped by series. Radix Tabs gives the
 * tablist roving focus and arrow-key navigation.
 */
export function ModelBrowser({
  models,
  savedIds,
  initialFamily,
  onChoose,
}: ModelBrowserProps) {
  const [tab, setTab] = useState<string>(initialFamily ?? POPULAR_TAB);
  const families = useMemo(() => familiesPresent(models), [models]);
  const popular = useMemo(() => popularModels(models), [models]);
  // A preset family with no models (or a stale tab) shows «Популярні».
  const activeTab = (families as string[]).includes(tab) ? tab : POPULAR_TAB;

  return (
    <Tabs value={activeTab} onValueChange={setTab} className="gap-4">
      {/* Phone: one scrolling row that bleeds to the sheet edges; from `sm`
          the tabs wrap. `py-1` keeps the focus ring inside the scroller. */}
      <TabsList
        aria-label={t.familiesAria}
        className="-mx-4 flex h-auto w-auto scrollbar-none justify-start gap-1.5 overflow-x-auto rounded-none bg-transparent px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        <TabsTrigger value={POPULAR_TAB} className={TAB_CLASS}>
          {t.popular}
        </TabsTrigger>
        {families.map((family) => (
          <TabsTrigger key={family} value={family} className={TAB_CLASS}>
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 rounded-full",
                getDeviceFamilyTone(family).strong,
              )}
            />
            {t.families[family]}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={POPULAR_TAB}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {popular.map((model) => (
            <PopularTile
              key={model.id}
              model={model}
              saved={savedIds.has(model.id)}
              onChoose={onChoose}
            />
          ))}
        </div>
      </TabsContent>

      {families.map((family) => (
        <TabsContent key={family} value={family}>
          <SeriesGroups
            models={models}
            family={family}
            savedIds={savedIds}
            onChoose={onChoose}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

const TAB_CLASS =
  "h-11 flex-none gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none";

function PopularTile({
  model,
  saved,
  onChoose,
}: {
  model: PickerModel;
  saved: boolean;
  onChoose: (model: PickerModel) => void;
}) {
  const tone = getDeviceFamilyTone(model.family);
  const glyph = deviceGlyph(model.family);
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => onChoose(model)}
      className={cn(
        "relative flex min-h-29 flex-col items-start rounded-card border-2 p-3.5 text-left transition-shadow hover:shadow-lift motion-reduce:transition-none",
        tone.surface,
        saved ? "border-foreground" : "border-transparent",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mb-auto grid size-9 place-items-center rounded-full",
          tone.strong,
          // The dark glyph on the bright family disc; the neutral (muted-
          // foreground) disc takes the page colour instead.
          model.family ? "text-footer" : "text-background",
        )}
      >
        {glyph === "watch" ? (
          <Watch className="size-4.5" />
        ) : glyph === "tablet" ? (
          <Tablet className="size-4.5" />
        ) : (
          <Smartphone className="size-4.5" />
        )}
      </span>
      {saved && (
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 grid size-6.5 place-items-center rounded-full bg-foreground text-background"
        >
          <Check strokeWidth={2.5} className="size-3.5" />
        </span>
      )}
      <span className="mt-3 text-xs text-muted-foreground">
        {[model.brandName, dict.devicePicker.productCount(model.productCount)]
          .filter(Boolean)
          .join(dict.devicePicker.metaSeparator)}
      </span>
      <span className="text-base leading-snug font-bold text-foreground">
        {model.name}
      </span>
    </button>
  );
}

function SeriesGroups({
  models,
  family,
  savedIds,
  onChoose,
}: {
  models: readonly PickerModel[];
  family: DeviceFamily;
  savedIds: ReadonlySet<string>;
  onChoose: (model: PickerModel) => void;
}) {
  const groups = useMemo(() => groupBySeries(models, family), [models, family]);
  const tone = getDeviceFamilyTone(family);
  const hover = getDeviceFamilyHoverSurface(family);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className={cn(KICKER, "mb-2")}>
            {group.title ?? t.families[family]}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {group.models.map((model) => {
              const saved = savedIds.has(model.id);
              return (
                <button
                  key={model.id}
                  type="button"
                  aria-pressed={saved}
                  onClick={() => onChoose(model)}
                  className={cn(
                    "h-11 rounded-full border px-3.5 text-sm text-foreground transition-colors",
                    saved
                      ? cn("border-foreground font-bold", tone.surface)
                      : cn(
                          "border-border bg-card font-medium hover:border-transparent",
                          hover,
                        ),
                    FOCUS_RING,
                  )}
                >
                  {model.name}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
