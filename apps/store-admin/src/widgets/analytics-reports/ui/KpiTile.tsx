import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { DeltaBadge, type DeltaBadgeProps } from "./DeltaBadge";

const d = dict.analytics;

export interface KpiTileProps {
  label: string;
  /** Already formatted — «412 300 ₴», «176». */
  value: string;
  /** The same number for the previous period, formatted like `value`. */
  previous: string;
  changePct: number | null;
  goodWhen?: DeltaBadgeProps["goodWhen"];
  /**
   * The tile the row is about — «Чистий» in «Продажі» (`.tile.k`): tinted with
   * the primary colour so the eye lands on it first.
   */
  accent?: boolean;
  className?: string;
}

/**
 * KpiTile — one headline number of a report (TASK-692, `.tile` in the
 * Analytics artboard): label, value, the change to the previous period and
 * «було …», so the change is never read without its base.
 */
export function KpiTile({
  label,
  value,
  previous,
  changePct,
  goodWhen,
  accent = false,
  className,
}: KpiTileProps) {
  return (
    <div
      data-slot="kpi-tile"
      data-accent={accent || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border p-3",
        accent ? "border-primary/30 bg-primary/5" : "border-border",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-display text-lg font-bold tabular-nums text-foreground md:text-2xl">
        {value}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <DeltaBadge changePct={changePct} goodWhen={goodWhen} />
        <span className="text-xs text-muted-foreground">{d.was(previous)}</span>
      </span>
    </div>
  );
}
