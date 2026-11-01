"use client";

import { useCallback } from "react";

import {
  addDevice,
  toMyDeviceInput,
  useMyDevices,
  type DeviceModelLike,
} from "@/entities/my-devices";

/**
 * Where a model stands in the shopper's «Мої пристрої» (TASK-2074):
 * - `active` — it is the first (active) device;
 * - `saved`  — saved, but another device is active;
 * - `new`    — not saved.
 */
export type ModelDeviceStatus = "active" | "saved" | "new";

export interface ModelDeviceState {
  status: ModelDeviceStatus;
  /** The owner's note on the saved device («Мама»), if any. */
  label?: string;
  /** Save (or re-activate) the model and make it the active device. */
  makeActive: () => void;
}

/**
 * The device action of the search model block: «Додати до моїх пристроїв» /
 * «Показувати для нього» / «✓ Ваш пристрій». Both buttons do the same thing —
 * put the model at the head of the list — so there is one `makeActive`.
 * Re-renders on every store change, in this tab and in others.
 */
export function useModelDeviceState(model: DeviceModelLike): ModelDeviceState {
  const devices = useMyDevices();
  const index = devices.findIndex((d) => d.modelId === model.id);
  const makeActive = useCallback(
    () => addDevice(toMyDeviceInput(model)),
    [model],
  );
  if (index < 0) return { status: "new", makeActive };
  return {
    status: index === 0 ? "active" : "saved",
    label: devices[index].label,
    makeActive,
  };
}
