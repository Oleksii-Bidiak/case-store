// TEMPORARY category glyphs for the device bar (TASK-2074). Categories carry
// no icon in the API yet — TASK-1956 adds `Category.icon` and a shared sprite,
// which replaces this lookup. Until then the seeded root slugs get a matching
// Lucide glyph and anything else a neutral package. Categories are always
// drawn neutral (muted), never in a family colour (Д3 colour rule).

import {
  BatteryCharging,
  Cable,
  Camera,
  Car,
  Headphones,
  Package,
  Shield,
  Smartphone,
  Speaker,
  Watch,
  Zap,
  type LucideIcon,
} from "lucide-react";

const GLYPH_BY_SLUG: Readonly<Record<string, LucideIcon>> = {
  cases: Smartphone,
  smartphones: Smartphone,
  "screen-protectors": Shield,
  "camera-protectors": Camera,
  chargers: Zap,
  cables: Cable,
  "power-banks": BatteryCharging,
  holders: Car,
  headphones: Headphones,
  speakers: Speaker,
  smartwatches: Watch,
};

export function categoryGlyph(slug: string): LucideIcon {
  return GLYPH_BY_SLUG[slug] ?? Package;
}
