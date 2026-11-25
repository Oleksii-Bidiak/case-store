"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useDevicePickerState } from "@/entities/my-devices";

// The device picker is closed on every first paint, so its code (the dialog,
// the model browser, the search results) stays out of the page's first-load
// JS (TASK-2524). It mounts the first time `openDevicePicker()` opens it, and
// stays mounted afterwards, so the close animation and Radix's focus return
// behave as before. The slice's own file, not its barrel, so the chunk
// carries only what the dialog uses.
const DevicePicker = dynamic(
  () =>
    import("@/features/device-picker/ui/device-picker").then(
      (m) => m.DevicePicker,
    ),
  { ssr: false },
);

/**
 * The picker opens from a dozen places (header chip, homepage, PDP, footer,
 * /devices, search), so there is no single trigger to preload it from on
 * intent. Instead its chunk is fetched once the browser is idle after the
 * page settles: off the first load, but usually in cache by the first open.
 */
function preloadWhenIdle(): () => void {
  const preload = () => {
    // A failed preload is retried by the real open, which owns the error.
    import("@/features/device-picker/ui/device-picker").catch(() => {});
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

  return mounted ? <DevicePicker /> : null;
}
