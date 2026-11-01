"use client";

import { ChevronDown, X } from "lucide-react";

import { getDeviceFamilyTone } from "@/entities/device";
import type { MyDevice } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import { FOCUS_RING, PRIMARY_CONTROL_ATTR } from "./bar-styles";

const t = dict.devicePicker.bar;

interface DeviceChipProps {
  device: MyDevice;
  /** How many devices are saved — «Ваш:» for one, «ще N» for more. */
  savedCount: number;
  onChange: () => void;
  onForget: () => void;
}

/**
 * «Ваш: iPhone 15 Pro ⌄ | ✕» — the active device in its family tone (TASK-2074,
 * header part of TASK-1953). Two click targets in one pill: the name opens the
 * picker (change / add), the ✕ forgets the device and the next one becomes
 * active. Below 1024 it stretches across the row and carries «ще N»; from 1024
 * it sits at its natural width and shows the device's label instead, since the
 * idle pills beside it take over the «ще N» job.
 */
export function DeviceChip({
  device,
  savedCount,
  onChange,
  onForget,
}: DeviceChipProps) {
  const tone = getDeviceFamilyTone(device.family);
  const others = savedCount - 1;

  return (
    <div
      className={cn(
        "flex h-11 max-w-full min-w-0 flex-1 items-center rounded-full text-foreground lg:flex-initial",
        tone.surface,
      )}
    >
      <button
        type="button"
        {...{ [PRIMARY_CONTROL_ATTR]: "" }}
        aria-label={t.activeAria(device.name, device.label)}
        aria-haspopup="dialog"
        onClick={onChange}
        className={cn(
          "inline-flex h-full min-w-0 flex-1 items-center gap-2 rounded-l-full pr-2 pl-3.5 text-sm transition-interactive hover:bg-foreground/8 active:bg-foreground/14",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
        />
        {savedCount === 1 && (
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">
            {t.yours}
          </span>
        )}
        <span className="min-w-0 truncate font-bold">{device.name}</span>
        {device.label && (
          <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">
            {device.label}
          </span>
        )}
        {others > 0 && (
          <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-semibold whitespace-nowrap lg:hidden">
            {t.more(others)}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-muted-foreground lg:ml-0"
        />
      </button>
      <button
        type="button"
        aria-label={t.forgetAria(device.name)}
        onClick={onForget}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-r-full border-l border-foreground/14 transition-interactive hover:bg-foreground/8 active:bg-foreground/14",
          FOCUS_RING,
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
