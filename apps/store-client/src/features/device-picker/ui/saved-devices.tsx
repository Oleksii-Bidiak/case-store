"use client";

import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";

import { getDeviceFamilyTone } from "@/entities/device";
import type { MyDevice } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { SAVED_PREVIEW_COUNT } from "../model/picker-models";
import { FOCUS_RING } from "./picker-styles";

const t = dict.devicePicker.dialog;

interface SavedDevicesProps {
  devices: readonly MyDevice[];
  /** Compatible-product count per model id, when the model list has loaded. */
  productCountById: ReadonlyMap<string, number>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onActivate: (modelId: string) => void;
  onForget: (device: MyDevice) => void;
  /** A link inside the picker was followed — close it. */
  onNavigate: () => void;
}

/**
 * «Ваші пристрої» — the saved list on top of the picker: tap a row to make it
 * active (and close), ✕ to forget it (the picker stays open). Six rows, then
 * «Показати всі (N)».
 */
export function SavedDevices({
  devices,
  productCountById,
  expanded,
  onToggleExpanded,
  onActivate,
  onForget,
  onNavigate,
}: SavedDevicesProps) {
  const visible = expanded ? devices : devices.slice(0, SAVED_PREVIEW_COUNT);
  const hasMore = devices.length > SAVED_PREVIEW_COUNT;

  return (
    <>
      {/* 1 column on a phone, 2 in a narrow dialog, 3 at full width — sized
          by the panel (container query), not the viewport. */}
      <div
        role="group"
        aria-label={t.savedGroupAria}
        className="grid gap-2 @md:grid-cols-2 @2xl:grid-cols-3"
      >
        {visible.map((device, index) => {
          const active = index === 0;
          const tone = getDeviceFamilyTone(device.family);
          const count = productCountById.get(device.modelId);
          const meta = [
            device.label,
            device.brandName || undefined,
            count === undefined
              ? undefined
              : dict.devicePicker.productCount(count),
          ]
            .filter(Boolean)
            .join(dict.devicePicker.metaSeparator);

          return (
            <div
              key={device.modelId}
              data-active={active || undefined}
              className={cn(
                "flex min-w-0 items-center rounded-pad border-2",
                active
                  ? cn("border-foreground", tone.surface)
                  : "border-transparent bg-muted",
              )}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onActivate(device.modelId)}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-menu py-1.5 pr-1 pl-3.5 text-left",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
                />
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="truncate font-bold text-foreground">
                    {device.name}
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    {active && (
                      <>
                        <Check
                          aria-hidden="true"
                          strokeWidth={2.5}
                          className="size-3.5 shrink-0"
                        />
                        <span className="shrink-0">
                          {t.activeNow}
                          {meta && dict.devicePicker.metaSeparator}
                        </span>
                      </>
                    )}
                    <span className="truncate">{meta}</span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={t.forget(device.name)}
                onClick={() => onForget(device)}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-interactive hover:bg-muted hover:text-foreground active:scale-94 motion-reduce:active:scale-100",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {hasMore && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggleExpanded}
            className={cn(
              "min-h-11 self-start rounded-sm text-sm font-semibold text-foreground underline underline-offset-3",
              FOCUS_RING,
            )}
          >
            {expanded ? t.collapse : t.showAll(devices.length)}
          </button>
        )}
        <Link
          href="/devices"
          onClick={onNavigate}
          className={cn(
            "ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-foreground underline-offset-3 hover:underline",
            FOCUS_RING,
          )}
        >
          {t.manage}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </>
  );
}
