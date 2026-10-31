import {
  BatteryMedium,
  Car,
  Headphones,
  LayoutGrid,
  type LucideIcon,
  Plug,
  Shield,
  Smartphone,
  Speaker,
  Tablet,
  Watch,
  Zap,
} from "lucide-react";
import type { DeviceFamily } from "@/entities/device";

/**
 * Category glyphs of the hub's chips and section tiles — TEMPORARY, keyed by
 * the seed's top-level slugs as drawn in the DeviceHub mockup. The real,
 * admin-chosen category icon set is TASK-1956 (`Category.icon`); until it
 * lands an unknown slug gets the neutral grid glyph, never a guessed one.
 */
const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  cases: Smartphone,
  "screen-protectors": Shield,
  chargers: Zap,
  cables: Plug,
  "power-banks": BatteryMedium,
  holders: Car,
  "car-holders": Car,
  "watch-bands": Watch,
  smartwatches: Watch,
  smartphones: Smartphone,
  headphones: Headphones,
  speakers: Speaker,
};

export function HubCategoryIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[slug] ?? LayoutGrid;
  return <Icon aria-hidden="true" className={className} />;
}

/** Family → device glyph: watch, tablet, otherwise a phone. */
export function HubFamilyIcon({
  family,
  className,
}: {
  family: DeviceFamily | null;
  className?: string;
}) {
  const Icon =
    family === "watch" ? Watch : family === "ipad" ? Tablet : Smartphone;
  return <Icon aria-hidden="true" className={className} />;
}
