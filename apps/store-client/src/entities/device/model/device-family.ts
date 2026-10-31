// Device family (Д3 colour rule, design-system §1.3): hue = device family.
//
// The API exposes no family field — it is derived here from the brand plus the
// model's series/name, so the storefront can tint tiles, chips and dots with the
// `family-*` tokens declared in `app/globals.css`. Anything we cannot place
// (AirPods, a new brand) resolves to `null` and renders in the NEUTRAL tone —
// never a guessed hue, never an alarm colour.

/** Family keys in the picker's tab order. */
export const DEVICE_FAMILIES = [
  "iphone",
  "galaxy",
  "redmi",
  "watch",
  "ipad",
] as const;

export type DeviceFamily = (typeof DEVICE_FAMILIES)[number];

export function isDeviceFamily(value: unknown): value is DeviceFamily {
  return (
    typeof value === "string" &&
    (DEVICE_FAMILIES as readonly string[]).includes(value)
  );
}

/** What the resolver reads — any subset of a device-model list item. */
export interface DeviceFamilySource {
  brandName?: string | null;
  brandSlug?: string | null;
  series?: string | null;
  name?: string | null;
}

const has = (text: string, word: string) =>
  new RegExp(`(^|[^a-z])${word}`).test(text);

/**
 * Resolve the family of a device model from its brand and series/name.
 * Brand wins for Samsung (every Galaxy device, phones, tabs and watches) and
 * Xiaomi/Redmi/POCO; Apple splits by product line. Without a recognised brand
 * the series/name keywords decide. Unknown → `null` (neutral tone).
 */
export function getDeviceFamily(
  source: DeviceFamilySource,
): DeviceFamily | null {
  const brand = `${source.brandSlug ?? ""} ${source.brandName ?? ""}`
    .toLowerCase()
    .trim();
  const text = `${source.series ?? ""} ${source.name ?? ""}`.toLowerCase();

  if (has(brand, "samsung")) return "galaxy";
  if (has(brand, "xiaomi") || has(brand, "redmi") || has(brand, "poco")) {
    return "redmi";
  }

  const apple = has(brand, "apple");
  if (has(text, "iphone")) return "iphone";
  if (has(text, "ipad")) return "ipad";
  if ((apple && has(text, "watch")) || has(text, "apple watch")) return "watch";
  if (apple) return null;

  if (has(text, "galaxy")) return "galaxy";
  if (has(text, "redmi") || has(text, "xiaomi") || has(text, "poco")) {
    return "redmi";
  }
  return null;
}

/**
 * Tailwind utilities per family. Kept as a STATIC lookup with full class names
 * so Tailwind's source scan sees every one — never build `bg-family-${f}`
 * dynamically. `surface` = tile / panel / chip tone, `strong` = dot / icon disc.
 */
export interface DeviceFamilyTone {
  surface: string;
  strong: string;
}

export const DEVICE_FAMILY_TONE: Readonly<
  Record<DeviceFamily, DeviceFamilyTone>
> = {
  iphone: { surface: "bg-family-iphone", strong: "bg-family-iphone-strong" },
  galaxy: { surface: "bg-family-galaxy", strong: "bg-family-galaxy-strong" },
  redmi: { surface: "bg-family-redmi", strong: "bg-family-redmi-strong" },
  watch: { surface: "bg-family-watch", strong: "bg-family-watch-strong" },
  ipad: { surface: "bg-family-ipad", strong: "bg-family-ipad-strong" },
};

/** Fallback for an unknown family: categories and "not fitting" stay neutral. */
export const NEUTRAL_FAMILY_TONE: DeviceFamilyTone = {
  surface: "bg-muted",
  strong: "bg-muted-foreground",
};

export function getDeviceFamilyTone(
  family: DeviceFamily | null | undefined,
): DeviceFamilyTone {
  return family ? DEVICE_FAMILY_TONE[family] : NEUTRAL_FAMILY_TONE;
}
