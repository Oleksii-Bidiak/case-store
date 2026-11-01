"use client";

import Link from "next/link";
import { ArrowRight, Smartphone, Tablet, Watch } from "lucide-react";

import { getDeviceFamilyTone } from "@/entities/device";
import { popularModels, type PickerModel } from "@/features/device-picker";
import { dict, H1_CLASS } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button, Skeleton } from "@/shared/ui";

import {
  HERO_TILE_COUNT,
  HERO_TILE_COUNT_COMPACT,
  deviceHubHref,
  hasHub,
} from "../model/hero-models";
import { HeroModelSearch } from "./hero-model-search";
import {
  FOCUS_RING,
  HERO_PANEL,
  KICKER,
  TILE_MOTION,
  deviceGlyph,
} from "./hero-styles";

const t = dict.devicePicker.hero;
const td = dict.devicePicker.dialog;

interface HeroPickerProps {
  models: readonly PickerModel[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Saves the model as the active device and leaves for its hub. */
  onChoose: (model: PickerModel) => void;
  /** Saves only — a tile that is itself a link to the hub. */
  onSave: (model: PickerModel) => void;
  /** Opens the full picker, optionally preset to a query. */
  onOpenPicker: (query?: string) => void;
  className?: string;
}

const TILE =
  "relative flex min-h-30 flex-col items-start rounded-card p-3.5 text-left text-foreground";

/**
 * State A of the homepage first block — no saved device yet: the page h1
 * «Для якого пристрою шукаєте?», the model search and the popular model
 * tiles in their family tones (5 + «Усі моделі» on a phone, 7 + 1 from 768).
 * Two columns (5/12 text, 7/12 tiles) from 1024.
 */
export function HeroPicker({
  models,
  isLoading,
  isError,
  onRetry,
  onChoose,
  onSave,
  onOpenPicker,
  className,
}: HeroPickerProps) {
  const tiles = popularModels(models, HERO_TILE_COUNT);
  const loading = models.length === 0 && isLoading;

  return (
    <section
      aria-label={t.sectionAria}
      className={cn(
        HERO_PANEL,
        "bg-card shadow-card lg:grid-cols-12 lg:items-center lg:gap-8",
        className,
      )}
    >
      <div className="min-w-0 lg:col-span-5">
        <h1
          className={cn(
            H1_CLASS,
            "leading-tight text-balance text-foreground lg:text-5xl",
          )}
        >
          {t.title}
        </h1>
        <p className="mt-3 mb-5 max-w-110 text-base leading-relaxed text-muted-foreground">
          {t.lede}
        </p>
        <HeroModelSearch
          models={models}
          loading={loading}
          onChoose={onChoose}
          onOpenPicker={(query) => onOpenPicker(query)}
        />
        <p className="mt-2.5 ml-1.5 text-sm text-muted-foreground">{t.hint}</p>
      </div>

      <div className="min-w-0 lg:col-span-7">
        <p className={cn(KICKER, "mb-2.5")}>{t.popularLabel}</p>
        {isError && models.length === 0 ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-pad bg-muted p-4 text-sm"
          >
            <p className="text-muted-foreground">{td.loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {td.retry}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {loading
              ? Array.from({ length: HERO_TILE_COUNT }, (_, i) => (
                  <Skeleton
                    key={i}
                    className={cn(
                      "min-h-30 rounded-card",
                      i >= HERO_TILE_COUNT_COMPACT && "hidden md:block",
                    )}
                  />
                ))
              : tiles.map((model, i) => (
                  <ModelTile
                    key={model.id}
                    model={model}
                    // Tiles 6–7 only from 768 — the phone grid stays 3 × 2.
                    className={
                      i >= HERO_TILE_COUNT_COMPACT
                        ? "hidden md:flex"
                        : undefined
                    }
                    onChoose={onChoose}
                    onSave={onSave}
                  />
                ))}
            <button
              type="button"
              onClick={() => onOpenPicker()}
              className={cn(TILE, "bg-muted", TILE_MOTION, FOCUS_RING)}
            >
              <span
                aria-hidden="true"
                className="mb-auto grid size-9.5 place-items-center rounded-full bg-card text-foreground"
              >
                <ArrowRight className="size-4.5" />
              </span>
              {models.length > 0 && (
                <span className="mt-3 text-xs text-muted-foreground">
                  {t.modelsTotal(models.length)}
                </span>
              )}
              <span className="text-base leading-snug font-bold">
                {t.allModels}
              </span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ModelTile({
  model,
  className,
  onChoose,
  onSave,
}: {
  model: PickerModel;
  className?: string;
  onChoose: (model: PickerModel) => void;
  onSave: (model: PickerModel) => void;
}) {
  const tone = getDeviceFamilyTone(model.family);
  const glyph = deviceGlyph(model.family);
  const tileClass = cn(TILE, tone.surface, TILE_MOTION, FOCUS_RING, className);
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "mb-auto grid size-9.5 place-items-center rounded-full",
          tone.strong,
          // Dark glyph on the bright (theme-invariant) family disc; the
          // neutral disc is muted-foreground, which takes the page colour.
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
      <span className="mt-3 text-xs text-muted-foreground">
        {[model.brandName, dict.devicePicker.productCount(model.productCount)]
          .filter(Boolean)
          .join(dict.devicePicker.metaSeparator)}
      </span>
      <span className="text-base leading-snug font-bold">{model.name}</span>
    </>
  );

  // A model with products leads to its hub — a real link (prefetch, open in
  // a new tab) that also saves the device. One without products has no hub:
  // the tile only saves it, and the block flips to the device panel.
  if (hasHub(model.productCount)) {
    return (
      <Link
        href={deviceHubHref(model.slug)}
        onClick={() => onSave(model)}
        className={tileClass}
      >
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onChoose(model)} className={tileClass}>
      {content}
    </button>
  );
}
