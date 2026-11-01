"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  openDevicePicker,
  useActiveDevice,
  useDevicePickerState,
  type MyDevice,
} from "@/entities/my-devices";

/**
 * «Ще N — обрати інший» (TASK-2077): open the shared device picker and, once
 * the shopper picks a device there, hand it to `onPicked` so the listing can
 * filter by it.
 *
 * The picker is the header's single instance and only touches «Мої
 * пристрої» (localStorage): a pick makes that device active and closes the
 * picker, but never writes `?device=`. Without this the header chip named the
 * new device while the grid stayed filtered by the old one.
 *
 * Only the instance that opened the picker follows it (the rail and the
 * drawer both render the panel), and only once: closing the picker without a
 * new pick — or picking the device that was already active — ends the wait.
 */
export function useFollowPickedDevice(
  onPicked: (device: MyDevice) => void,
): () => void {
  const active = useActiveDevice();
  const { open } = useDevicePickerState();
  // The active device's id when this instance opened the picker; `null` when
  // it is not waiting for a pick.
  const awaiting = useRef<string | null>(null);
  const onPickedRef = useRef(onPicked);

  useEffect(() => {
    onPickedRef.current = onPicked;
  }, [onPicked]);

  useEffect(() => {
    if (awaiting.current === null) return;
    if (active && active.modelId !== awaiting.current) {
      awaiting.current = null;
      onPickedRef.current(active);
    } else if (!open) {
      awaiting.current = null;
    }
  }, [active, open]);

  return useCallback(() => {
    awaiting.current = active?.modelId ?? "";
    openDevicePicker();
  }, [active]);
}
