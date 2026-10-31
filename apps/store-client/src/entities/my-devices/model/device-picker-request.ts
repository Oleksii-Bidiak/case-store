"use client";

// The device picker's open/close command (TASK-2070).
//
// Every entry point — the header chip and «+», the homepage picker, the PDP
// compat row, /devices, search — opens the SAME single picker instance, which
// the header mounts once. The command lives here, in the entity, rather than
// in features/device-picker, so that a feature (device-fit, search) can open
// the picker without a lateral feature → feature import. Client-only state,
// read with useSyncExternalStore; the server snapshot is always "closed".

import { useSyncExternalStore } from "react";

import type { DeviceFamily } from "@/entities/device/model/device-family";

import type { MyDevice } from "./my-devices";

export interface DevicePickerRequest {
  /** Preset search text — the picker opens in results mode. */
  query?: string;
  /** Preset family tab (ignored when the family has no models). */
  family?: DeviceFamily;
  /**
   * Runs after the shopper chooses a model or switches to a saved device —
   * the store is already updated and the picker closed — with the now-active
   * device. The homepage hero uses it to go on to the device's hub
   * (TASK-1952). Not called when a device is forgotten.
   */
  onChoose?: (device: MyDevice) => void;
}

export interface DevicePickerState {
  open: boolean;
  request: DevicePickerRequest;
  /** Bumped on every open — a fresh request resets the picker's local state. */
  seq: number;
}

const CLOSED: DevicePickerState = Object.freeze({
  open: false,
  request: Object.freeze({}),
  seq: 0,
});

let state: DevicePickerState = CLOSED;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Open the device picker, optionally preset to a query or a family tab. */
export function openDevicePicker(request: DevicePickerRequest = {}): void {
  state = { open: true, request: { ...request }, seq: state.seq + 1 };
  emit();
}

export function closeDevicePicker(): void {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

export function getDevicePickerState(): DevicePickerState {
  return state;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const getServerSnapshot = () => CLOSED;

/** The picker's open state — for the single mounted picker instance. */
export function useDevicePickerState(): DevicePickerState {
  return useSyncExternalStore(
    subscribe,
    getDevicePickerState,
    getServerSnapshot,
  );
}
