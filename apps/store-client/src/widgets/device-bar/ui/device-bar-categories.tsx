"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import type { MyDevice } from "@/entities/my-devices";
import { dict, PAGE_CONTAINER } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui";

import { categoryGlyph } from "../model/category-glyph";
import {
  deviceCategoryHref,
  type DeviceCategory,
} from "../model/device-categories";
import { useFitCount } from "../model/use-fit-count";
import { BAR_PILL, FOCUS_RING } from "./bar-styles";

const t = dict.devicePicker.bar;

/** Skeleton pills while the categories load — the tier keeps its height. */
const SKELETON_PILLS = 5;

interface DeviceBarCategoriesProps {
  device: MyDevice;
  categories: readonly DeviceCategory[];
  isLoading: boolean;
  panelId: string;
  panelOpen: boolean;
  onTogglePanel: () => void;
}

/**
 * Tier 2 of the device bar (≥ 1024, only with a device): «Для iPhone 15 Pro:»,
 * as many of the device's categories as fit on one line, and «Усі категорії ·
 * N» opening the full-width panel. Categories stay neutral — the hue belongs
 * to the device (Д3 colour rule). One line, never a scroll: the links wrap to
 * a clipped second line and `useFitCount` makes those invisible.
 */
export const DeviceBarCategories = forwardRef<
  HTMLButtonElement,
  DeviceBarCategoriesProps
>(function DeviceBarCategories(
  { device, categories, isLoading, panelId, panelOpen, onTogglePanel },
  toggleRef,
) {
  const [rowRef, fit] = useFitCount<HTMLDivElement>(categories);

  return (
    <div className="hidden border-t border-border lg:block">
      <nav
        aria-label={t.categoriesAria(device.name)}
        className={`${PAGE_CONTAINER} flex h-13 items-center gap-1`}
      >
        <span className="mr-1.5 shrink-0 text-sm font-semibold whitespace-nowrap text-muted-foreground">
          {t.categoriesFor(device.name)}
        </span>

        {isLoading ? (
          <div
            aria-hidden="true"
            className="flex min-w-0 flex-1 gap-1 overflow-hidden p-1"
          >
            {Array.from({ length: SKELETON_PILLS }, (_, i) => (
              <Skeleton key={i} className="h-11 w-32 shrink-0 rounded-full" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {t.noCategories}{" "}
            <Link
              href="/products"
              className={cn(
                "rounded-sm font-semibold text-foreground underline underline-offset-3",
                FOCUS_RING,
              )}
            >
              {t.noCategoriesLink}
            </Link>
          </p>
        ) : (
          <>
            {/* One 44px line in the 52px tier; extra links wrap to a second
                line that starts exactly at the clip edge. The 4px inset on
                every side keeps a focused link's outline (2px + 2px offset)
                inside the clip. */}
            <div
              ref={rowRef}
              className="flex h-13 min-w-0 flex-1 flex-wrap content-start items-center gap-1 overflow-hidden p-1"
            >
              {categories.map((category, index) => {
                const Glyph = categoryGlyph(category.slug);
                return (
                  <Link
                    key={category.id}
                    href={deviceCategoryHref(category.slug, device.slug)}
                    className={cn(
                      "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-foreground transition-shadow hover:bg-card hover:shadow-card",
                      FOCUS_RING,
                      fit !== null && index >= fit && "invisible",
                    )}
                  >
                    <Glyph
                      aria-hidden="true"
                      className="size-4.5 shrink-0 text-muted-foreground"
                    />
                    <span>{category.name}</span>
                  </Link>
                );
              })}
            </div>

            <button
              ref={toggleRef}
              type="button"
              aria-expanded={panelOpen}
              aria-controls={panelOpen ? panelId : undefined}
              onClick={onTogglePanel}
              className={cn(
                BAR_PILL,
                "ml-auto pr-3 pl-4 hover:bg-muted",
                FOCUS_RING,
              )}
            >
              {t.allCategories(categories.length)}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none",
                  panelOpen && "rotate-180",
                )}
              />
            </button>
          </>
        )}
      </nav>
    </div>
  );
});
