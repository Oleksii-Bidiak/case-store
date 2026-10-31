"use client";

import { useRef } from "react";

import { useDeviceModelCatalog } from "@/entities/device";
import { closeDevicePicker, useDevicePickerState } from "@/entities/my-devices";
import { Dialog, DialogContent } from "@/shared/ui";

import { DevicePickerPanel } from "./device-picker-panel";

/** `sm` — the dialog layout starts here; below it the panel is a sheet. */
const DIALOG_MEDIA_QUERY = "(min-width: 40rem)";

/**
 * The ONE device picker (TASK-2070). Mount it once — the header does — and
 * open it from anywhere with `openDevicePicker({ query?, family? })`.
 *
 * One Radix dialog, two shapes, switched in CSS rather than by a JS media
 * query (so a rotation or resize never remounts it mid-choice):
 *   - < 640: bottom sheet — full width, `rounded-t-panel`, grab handle,
 *     slides up, at most 11/12 of the viewport tall;
 *   - ≥ 640: centred dialog — up to 760px wide, 1/12 from the top, at most
 *     5/6 of the viewport tall, `rounded-panel`.
 * Radix brings the focus trap, scroll lock, Esc / overlay-click close and
 * the return of focus to whatever opened it.
 *
 * The model list is fetched on the first open only (shared, cached query).
 */
export function DevicePicker() {
  const { open, request, seq } = useDevicePickerState();
  const catalog = useDeviceModelCatalog({ enabled: open });
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDevicePicker();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          // Desktop: straight into the search field. Phone: leave Radix's
          // default (the close button) so the keyboard does not cover the
          // sheet before the shopper has seen the tiles.
          if (window.matchMedia?.(DIALOG_MEDIA_QUERY).matches) {
            event.preventDefault();
            searchInputRef.current?.focus();
          }
        }}
        className={[
          // Sheet (base). `shadow-elevated` is set per breakpoint on purpose:
          // tailwind-merge does not know the role shadows, so a bare one would
          // sit next to the primitive's `shadow-lg` and lose to it in the
          // (alphabetical) cascade; a variant is emitted after every base
          // utility and wins either way.
          "@container top-auto right-0 bottom-0 left-0 flex max-h-11/12 w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-none rounded-t-panel border-0 bg-card px-4 pt-2.5 pb-6 max-sm:shadow-elevated max-sm:data-[state=closed]:slide-out-to-bottom-8 max-sm:data-[state=open]:slide-in-from-bottom-8 motion-reduce:animate-none",
          // Dialog (≥ 640): left/right 16px + auto margins centre it.
          "sm:top-1/12 sm:right-4 sm:bottom-auto sm:left-4 sm:mx-auto sm:max-h-5/6 sm:max-w-190 sm:gap-4 sm:shadow-elevated sm:rounded-panel sm:px-7 sm:pt-7 sm:pb-5.5",
        ].join(" ")}
      >
        <DevicePickerPanel
          key={seq}
          request={request}
          catalog={catalog}
          searchInputRef={searchInputRef}
        />
      </DialogContent>
    </Dialog>
  );
}
