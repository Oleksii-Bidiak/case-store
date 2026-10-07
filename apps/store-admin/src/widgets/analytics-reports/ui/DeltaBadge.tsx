import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { formatMagnitude, formatSigned } from "../lib/format";

const d = dict.analytics;

export interface DeltaBadgeProps {
  /**
   * Change against the previous period — percent, or percentage points with
   * `unit="pp"`. `null` when the previous period was zero: there is nothing to
   * divide by, and «+∞%» or «+100%» would both be inventions.
   */
  changePct: number | null;
  /**
   * Which way is good news. Sales up is good; returns up is not (Д-н2: «зростання
   * повернень — червоним, бо це погано»). The arrow always follows the number;
   * only the colour follows the meaning.
   */
  goodWhen?: "up" | "down";
  /** `%` for a relative change, `pp` for a change of a rate («+1,4 п. п.»). */
  unit?: "%" | "pp";
  className?: string;
}

/**
 * DeltaBadge — the «↗ +12%» next to every report number (TASK-692, `.dl` in
 * the Analytics artboard). Colour is never the only signal: the arrow carries
 * the direction and a screen reader hears the sentence, not the glyphs.
 */
export function DeltaBadge({
  changePct,
  goodWhen = "up",
  unit = "%",
  className,
}: DeltaBadgeProps) {
  const base =
    "inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap tabular-nums";

  if (changePct === null) {
    return (
      <span
        data-slot="delta-badge"
        data-trend="none"
        className={cn(base, "text-muted-foreground", className)}
      >
        <span aria-hidden="true">—</span>
        <span className="sr-only">{d.deltaNone}</span>
      </span>
    );
  }

  const withUnit = (value: string) =>
    unit === "pp" ? d.deltaPoints(value) : d.deltaPercent(value);
  // Read the sign off the formatted value, so «0,04» — printed as «0» — is
  // not painted as a rise.
  const shown = formatSigned(changePct);
  const trend = shown === "0" ? "flat" : changePct > 0 ? "up" : "down";
  const good = trend !== "flat" && trend === goodWhen;
  const Icon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const spoken =
    trend === "flat"
      ? d.deltaFlat
      : (trend === "up" ? d.deltaUp : d.deltaDown)(
          withUnit(formatMagnitude(changePct)),
        );

  return (
    <span
      data-slot="delta-badge"
      data-trend={trend}
      className={cn(
        base,
        trend === "flat"
          ? "text-muted-foreground"
          : good
            ? "text-success"
            : "text-destructive",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span aria-hidden="true">{withUnit(shown)}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
