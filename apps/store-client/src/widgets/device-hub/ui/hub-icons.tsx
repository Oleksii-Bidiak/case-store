import { Smartphone, Tablet, Watch } from "lucide-react";
import type { DeviceFamily } from "@/entities/device";

// Category glyphs come from `Category.icon` via `shared/ui/category-icon`
// (TASK-1956); this file keeps only the DEVICE glyph of the hub's hero.

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
