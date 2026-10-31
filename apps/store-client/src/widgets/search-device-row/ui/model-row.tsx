"use client";

import Link from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";

import type { DeviceFamilyTone } from "@/entities/device";
import {
  DeviceKindIcon,
  ModelDeviceAction,
  SEARCH_DEVICE_FOCUS,
  deviceHubHref,
  deviceLandingHref,
  searchHref,
  useModelDeviceState,
  type DeviceKind,
  type SearchDeviceMatch,
} from "@/features/search";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { CategoryIcon } from "@/shared/ui";

import { formatCount } from "../model/sold-devices";

/** One accessory category of the model (a group of the model hub). */
export interface ModelRowCategory {
  slug: string;
  name: string;
  /** `Category.icon` (TASK-1956) — null/unknown renders the folder. */
  icon: string | null;
  count: number;
}

/** Hover only where a pointer hovers; no lift or scale under reduced motion. */
const PILL_MOTION =
  "transition-interactive active:scale-98 motion-reduce:active:scale-100";

interface ModelRowProps {
  match: SearchDeviceMatch;
  tone: DeviceFamilyTone;
  /** `true` when the family is known — the dark glyph on the bright disc. */
  hasFamily: boolean;
  kind: DeviceKind;
  /** The model's accessory categories with counts; `[]` while loading. */
  categories: readonly ModelRowCategory[];
  /** «Сам … зараз не продаємо — лише аксесуари» (Д3-2). */
  showNotSold: boolean;
}

/**
 * The model row on `/search` (TASK-2069, Search mockup «Рядок моделі»): the
 * family-tinted panel that answers "you mean this model" before the results —
 * one primary action to the model's accessories (or straight to «Чохли для
 * …» when the query had an accessory word), the device action, the model's
 * categories and, when the words fit several models, «Або можливо:».
 */
export function ModelRow({
  match,
  tone,
  hasFamily,
  kind,
  categories,
  showNotSold,
}: ModelRowProps) {
  const { model, productWord } = match;
  const copy = dict.searchDevice.row;
  const device = useModelDeviceState(model);
  const alternatives = match.alternatives;

  const kicker =
    device.status === "active"
      ? copy.kickerActive
      : device.status === "saved"
        ? device.label
          ? copy.kickerSavedLabel(device.label)
          : copy.kickerSaved
        : copy.kickerGuess;

  // The main action: the accessory landing when the query named one and the
  // model has products there; otherwise all accessories of the model.
  const wordCategory = productWord
    ? categories.find((c) => c.slug === productWord)
    : undefined;
  const main =
    productWord && wordCategory
      ? {
          href: deviceLandingHref(wordCategory.slug, model.slug),
          label: copy.productFor(
            dict.searchDevice.productWords[productWord],
            model.name,
            formatCount(wordCategory.count),
          ),
        }
      : model.productCount > 0
        ? {
            href: deviceHubHref(model.slug),
            label: copy.accessoriesFor(
              model.name,
              formatCount(model.productCount),
            ),
          }
        : null;

  return (
    <section
      aria-label={copy.aria}
      className={cn(
        "flex flex-col gap-4 rounded-xl p-4.5 md:flex-row md:flex-wrap md:items-center md:px-6 md:py-5.5",
        tone.surface,
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5 md:flex-1">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-pad",
            tone.strong,
            hasFamily ? "text-footer" : "text-background",
          )}
        >
          <DeviceKindIcon kind={kind} className="size-6.5" />
        </span>
        <p className="min-w-0">
          <small className="block text-sm font-semibold text-muted-foreground">
            {kicker}
          </small>
          <b className="mt-0.5 block font-display text-xl leading-tight font-bold text-foreground md:text-2xl">
            {model.name}
          </b>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {main && (
          <Link
            href={main.href}
            className={cn(
              "inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-primary px-4.5 py-2 text-sm leading-tight font-semibold text-primary-foreground hover:bg-primary-hover hover:shadow-card active:bg-primary active:shadow-none",
              PILL_MOTION,
              SEARCH_DEVICE_FOCUS,
            )}
          >
            <span>{main.label}</span>
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        )}
        <ModelDeviceAction model={model} variant="row" />
      </div>

      {categories.length > 0 && (
        <ul
          aria-label={copy.categoriesAria(model.name)}
          className="flex flex-wrap gap-1.5 md:basis-full"
        >
          {categories.map((category) => {
            return (
              <li key={category.slug}>
                <Link
                  href={deviceLandingHref(category.slug, model.slug)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full bg-card/80 px-3 text-sm font-semibold text-foreground hover:bg-card hover:shadow-card",
                    PILL_MOTION,
                    SEARCH_DEVICE_FOCUS,
                  )}
                >
                  <CategoryIcon
                    icon={category.icon}
                    size={16}
                    className="text-muted-foreground"
                  />
                  {category.name}
                  <small className="text-xs font-medium text-muted-foreground tabular-nums">
                    {formatCount(category.count)}
                  </small>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {showNotSold && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground md:basis-full">
          <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
          {copy.notSold(model.name)}
        </p>
      )}

      {alternatives.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground md:basis-full">
          <span>{copy.alternativesLabel}</span>
          {alternatives.map((alt) => (
            <Link
              key={alt.id}
              href={searchHref(alt.name)}
              className={cn(
                "inline-flex h-8.5 items-center rounded-full border border-foreground/12 px-3 font-semibold text-foreground transition-colors duration-150 hover:bg-card/60 motion-reduce:transition-none",
                SEARCH_DEVICE_FOCUS,
              )}
            >
              {alt.name}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
