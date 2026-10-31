"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getDeviceFamilyHoverSurface } from "@/entities/device";
import type { MyDevice } from "@/entities/my-devices";
import { dict, PAGE_CONTAINER } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { categoryGlyph } from "../model/category-glyph";
import {
  deviceCategoryHref,
  deviceHubHref,
  totalProductCount,
  type DeviceCategory,
} from "../model/device-categories";
import { FOCUS_RING } from "./bar-styles";

const t = dict.devicePicker.bar;

interface DeviceBarPanelProps {
  id: string;
  device: MyDevice;
  categories: readonly DeviceCategory[];
  /** A link inside was followed — close the panel. */
  onNavigate: () => void;
}

/**
 * «Усе для iPhone 15 Pro» — every category of the active device in one
 * full-width drop under the header (TASK-2074). A disclosure, not a modal:
 * the toggle keeps focus, Escape / an outside click / a followed link close
 * it. Tiles warm up to the device's family tone on hover; the glyphs stay
 * neutral.
 */
export function DeviceBarPanel({
  id,
  device,
  categories,
  onNavigate,
}: DeviceBarPanelProps) {
  const titleId = useId();
  const hover = getDeviceFamilyHoverSurface(device.family);

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={titleId}
      className="absolute inset-x-0 top-full z-10 hidden border-t border-border bg-card shadow-elevated lg:block"
    >
      <div className={`${PAGE_CONTAINER} py-6`}>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2
            id={titleId}
            className="min-w-0 truncate font-display text-lg font-bold text-foreground"
          >
            {t.panelTitle(device.name, device.label)}
          </h2>
          <Link
            href={deviceHubHref(device.slug)}
            onClick={onNavigate}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-semibold text-foreground underline-offset-3 hover:underline",
              FOCUS_RING,
            )}
          >
            {t.openModelPage(
              dict.devicePicker.productCount(totalProductCount(categories)),
            )}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <ul className="grid grid-cols-3 gap-2 xl:grid-cols-4">
          {categories.map((category) => {
            const Glyph = categoryGlyph(category.slug);
            return (
              <li key={category.id}>
                <Link
                  href={deviceCategoryHref(category.slug, device.slug)}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-15 items-center gap-3 rounded-pad bg-background py-2 pr-3.5 pl-2 text-foreground transition-colors",
                    hover,
                    FOCUS_RING,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-menu bg-card"
                  >
                    <Glyph className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {category.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dict.devicePicker.productCount(category.productCount)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
