"use client";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

import { getDeviceFamilyTone, type DeviceModelMatch } from "@/entities/device";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import type { PickerModel } from "../model/picker-models";
import { FOCUS_RING } from "./picker-styles";

const t = dict.devicePicker.dialog;

/**
 * The matcher flags only typo / letter-by-letter hits as `corrected`; a word
 * its dictionary knows («айфон», «про») is not. The picker still confirms
 * any Cyrillic query (mockup spec: «Розуміємо й «айфон 15 про» — це …»).
 */
const CYRILLIC = /[а-яіїєґёъыэ]/i;

interface ModelSearchResultsProps {
  /** The trimmed query the results were computed for. */
  query: string;
  results: readonly DeviceModelMatch<PickerModel>[];
  savedIds: ReadonlySet<string>;
  onChoose: (model: PickerModel) => void;
  onNavigate: () => void;
}

/**
 * Live model search (typo- and Cyrillic-tolerant via `matchDeviceModels`).
 * The first hit is pre-highlighted in its family tone — Enter in the field
 * picks it. Zero hits → a neutral «немає в каталозі» box with a contact link.
 */
export function ModelSearchResults({
  query,
  results,
  savedIds,
  onChoose,
  onNavigate,
}: ModelSearchResultsProps) {
  const top = results[0];

  if (!top) {
    return (
      <div className="flex flex-col gap-1 rounded-pad bg-muted p-4 text-sm leading-normal">
        <p className="font-bold text-foreground">{t.emptyTitle}</p>
        <p className="text-muted-foreground">
          {t.emptyBodyBefore}
          <Link
            href="/contact"
            onClick={onNavigate}
            className={cn(
              "rounded-sm font-semibold text-foreground underline underline-offset-3",
              FOCUS_RING,
            )}
          >
            {t.emptyBodyLink}
          </Link>
          {t.emptyBodyAfter}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {(top.corrected || CYRILLIC.test(query)) && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check
            aria-hidden="true"
            strokeWidth={2.5}
            className="size-4 shrink-0 text-success"
          />
          {t.corrected(query, top.model.name)}
        </p>
      )}
      <ul aria-label={t.resultsAria} className="flex flex-col gap-1">
        {results.map(({ model }, index) => {
          const tone = getDeviceFamilyTone(model.family);
          const saved = savedIds.has(model.id);
          return (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => onChoose(model)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-pad py-2 pr-3 pl-3.5 text-left transition-colors",
                  index === 0 ? tone.surface : "hover:bg-muted",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate font-bold text-foreground">
                    {model.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      model.brandName,
                      dict.devicePicker.productCount(model.productCount),
                    ]
                      .filter(Boolean)
                      .join(dict.devicePicker.metaSeparator)}
                  </span>
                </span>
                {saved && (
                  <span className="shrink-0 rounded-full bg-foreground px-2.5 py-0.5 text-xs font-bold text-background">
                    {t.savedBadge}
                  </span>
                )}
                <ChevronRight
                  aria-hidden="true"
                  className="size-4.5 shrink-0 text-muted-foreground"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
