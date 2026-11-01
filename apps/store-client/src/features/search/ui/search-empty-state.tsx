"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import {
  getDeviceFamily,
  getDeviceFamilyTone,
  useDeviceModelCatalog,
} from "@/entities/device";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { deviceHubHref } from "../model/device-links";
import { SEARCH_DEVICE_FOCUS } from "./model-device-action";

/** How many popular models the empty state offers (Д3-2 §3.8). */
export const POPULAR_MODELS_LIMIT = 5;

interface SearchEmptyStateProps {
  /** The trimmed query that found nothing. */
  query: string;
  /**
   * An optional extra action under the chips — e.g. «Скинути всі фільтри»
   * when a filter, not the query, emptied the list.
   */
  action?: ReactNode;
}

/**
 * «За запитом … нічого немає» (TASK-2069, Д3-2 §3.8) — never a dead end: the
 * hint to search by a model, then the most popular models straight to their
 * DeviceHub. The model list is the cached popular-ordered one the picker
 * uses; until it arrives (or if it fails) the chips and their lead-in line
 * are simply not there — the heading and the hint still stand on their own.
 */
export function SearchEmptyState({ query, action }: SearchEmptyStateProps) {
  const copy = dict.searchDevice.empty;
  const { models } = useDeviceModelCatalog();
  const popular = models.slice(0, POPULAR_MODELS_LIMIT);

  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-card bg-card px-5 py-11 text-center shadow-card">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-sm bg-muted text-muted-foreground"
      >
        <Search className="size-7" />
      </span>
      <h2 className="mt-1 font-display text-xl leading-tight font-bold text-foreground">
        {copy.heading(query)}
      </h2>
      <p className="max-w-115 text-base leading-normal text-muted-foreground">
        {copy.body}
        {popular.length > 0 && <> {copy.popularLead}</>}
      </p>
      {popular.length > 0 && (
        <ul
          aria-label={copy.popularAria}
          className="mt-1.5 flex flex-wrap justify-center gap-2"
        >
          {popular.map((model) => {
            const tone = getDeviceFamilyTone(getDeviceFamily(model));
            return (
              <li key={model.id}>
                <Link
                  href={deviceHubHref(model.slug)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-foreground/35 hover:bg-muted motion-reduce:transition-none md:min-h-9",
                    SEARCH_DEVICE_FOCUS,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      tone.strong,
                    )}
                  />
                  {model.name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {action}
    </div>
  );
}
