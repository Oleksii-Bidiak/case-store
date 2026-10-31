"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getDeviceFamily, getDeviceFamilyTone } from "@/entities/device";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { deviceHubHref, deviceKindOf } from "../model/device-links";
import type { SearchDeviceMatch } from "../model/use-search-device-model";
import {
  DeviceKindIcon,
  ModelDeviceAction,
  SEARCH_DEVICE_FOCUS,
} from "./model-device-action";

interface SearchModelBlockProps {
  match: SearchDeviceMatch;
  /** A link of the block was followed — close the popup (and a menu). */
  onFollowLink: () => void;
}

/** Links swallow `mousedown` so the input does not blur before the click. */
const keepInputFocus = (event: MouseEvent) => event.preventDefault();

/**
 * The model block on top of the header suggestions (TASK-2069,
 * SearchSuggest mockup): the family-tinted card with «Все для {model}» and the
 * device action, plus «Також:» when the words fit more than one model. It
 * sits OUTSIDE the product listbox — its link and button are ordinary Tab
 * stops; ↑/↓ keep walking the product and article options only.
 */
export function SearchModelBlock({
  match,
  onFollowLink,
}: SearchModelBlockProps) {
  const { model, corrected } = match;
  // An alternative with no products would link to an empty (404) hub.
  const alternatives = match.alternatives.filter((m) => m.productCount > 0);
  const family = getDeviceFamily(model);
  const tone = getDeviceFamilyTone(family);
  const copy = dict.searchDevice.suggest;

  return (
    <div className="px-0.5 pt-0.5">
      <div
        role="group"
        aria-label={copy.blockAria(model.name)}
        className={cn(
          "flex items-center gap-3.5 rounded-pad p-3.5",
          tone.surface,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            tone.strong,
            family ? "text-footer" : "text-background",
          )}
        >
          <DeviceKindIcon
            kind={deviceKindOf({ ...model, family })}
            className="size-5"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-col">
            <small className="text-xs text-muted-foreground">
              {corrected ? copy.kickerCorrected : copy.kicker}
            </small>
            <b className="truncate text-base font-bold text-popover-foreground">
              {model.name}
            </b>
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {/* No products → the hub would be a 404; the device action stays. */}
            {model.productCount > 0 && (
              <Link
                href={deviceHubHref(model.slug)}
                onMouseDown={keepInputFocus}
                onClick={onFollowLink}
                className={cn(
                  "inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground",
                  "transition duration-150 ease-out hover:bg-primary/86 hover:shadow-card motion-reduce:transition-none",
                  SEARCH_DEVICE_FOCUS,
                )}
              >
                <span className="truncate">
                  {copy.allFor(model.name, model.productCount)}
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            )}
            <ModelDeviceAction model={model} variant="popup" />
          </div>
        </div>
      </div>

      {alternatives.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2.5 text-sm text-muted-foreground">
          <span>{copy.alsoLabel}</span>
          {alternatives.map((alt) => (
            <Link
              key={alt.id}
              href={deviceHubHref(alt.slug)}
              onMouseDown={keepInputFocus}
              onClick={onFollowLink}
              className={cn(
                "inline-flex h-8 items-center rounded-full border border-border px-3 font-medium text-foreground transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
                SEARCH_DEVICE_FOCUS,
              )}
            >
              {alt.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
