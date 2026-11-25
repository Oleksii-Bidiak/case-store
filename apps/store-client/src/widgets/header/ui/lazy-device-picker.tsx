"use client";

import { useEffect, useState } from "react";
import { useDevicePickerState } from "@/entities/my-devices";
import { lazyComponent } from "@/shared/lib/lazy-component";

// The device picker is closed on every first paint, so its code (the dialog,
// the model browser, the search results) stays out of the page's first-load
// JS (TASK-2524). It mounts the first time `openDevicePicker()` opens it, and
// stays mounted afterwards, so the close animation and Radix's focus return
// behave as before. A load that fails renders nothing and is reported; the
// next open retries. The slice's own file, not its barrel, so the chunk
// carries only what the dialog uses.
const lazyDevicePicker = lazyComponent(() =>
  import("@/features/device-picker/ui/device-picker").then(
    (m) => m.DevicePicker,
  ),
);
const DevicePicker = lazyDevicePicker.Component;

/**
 * The picker opens from a dozen places (header chip, homepage, PDP, footer,
 * /devices, search), so there is no single trigger to preload it from on
 * intent. Instead its chunk is fetched once the browser is idle after the
 * page settles: off the first load, but usually in cache by the first open.
 */
function preloadWhenIdle(): () => void {
  const preload = () => {
    void lazyDevicePicker.load();
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(preload, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(preload, 2000);
  return () => window.clearTimeout(id);
}

/** Mounts the one `DevicePicker` (TASK-2070) on its first open. */
export function LazyDevicePicker() {
  const { open } = useDevicePickerState();
  const [mounted, setMounted] = useState(false);
  // Render-time guard: mount in the same render the store turns `open`.
  if (open && !mounted) setMounted(true);

  useEffect(() => preloadWhenIdle(), []);
  // Every open (re)starts the load, so one that failed is retried.
  useEffect(() => {
    if (open) void lazyDevicePicker.load();
  }, [open]);

  return mounted ? <DevicePicker /> : null;
}
