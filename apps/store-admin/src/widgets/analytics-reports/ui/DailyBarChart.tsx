"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDayShort } from "@/shared/lib/format";

export interface DailyPoint {
  /** Kyiv calendar day, `YYYY-MM-DD`. */
  date: string;
  value: number;
}

export interface DailyBarChartProps {
  points: readonly DailyPoint[];
  /** Pixel height of the plot. */
  height: number;
  /** Y tick label («30 тис.», «4»). */
  formatTick: (value: number) => string;
  /** Explicit Y ticks; recharts picks them when absent. */
  yTicks?: number[];
  /** Label the first, middle and last day under the bars (`.ch-x`). */
  showDays?: boolean;
  /** The tooltip for the point at `index`. */
  renderTooltip: (index: number) => ReactNode;
  /**
   * The chart in one sentence for a screen reader (min, max…). The SVG is
   * drawing; this is the content.
   */
  summary: string;
}

const AXIS_TEXT = { fontSize: 11, fill: "var(--color-muted-foreground)" };

/** What recharts hands a custom tick (the part read here). */
interface TickProps {
  x?: number | string;
  y?: number | string;
  payload: { value: string | number };
}

/** Y-axis sizing: ≈ px per 11-px glyph, the tick gap, and the bounds. */
const CHAR_WIDTH = 6.5;
const Y_AXIS_GAP = 12;
const Y_AXIS_MIN = 28;
const Y_AXIS_MAX = 80;

/**
 * The bars of a report's daily series (TASK-692; `.ch` in the Analytics
 * artboard): one colour — primary — and destructive for a day below zero, a
 * zero line, hairline grid, the day under the hover in a token-styled tooltip.
 * No animation: a report that re-draws itself on every period switch is
 * motion with no information in it, and it spares `prefers-reduced-motion`.
 */
export function DailyBarChart({
  points,
  height,
  formatTick,
  yTicks,
  showDays = false,
  renderTooltip,
  summary,
}: DailyBarChartProps) {
  const first = points[0]?.date;
  const middle = points[Math.floor((points.length - 1) / 2)]?.date;
  const last = points.at(-1)?.date;
  const dayTicks = [first, middle, last].filter(
    (day, index, all): day is string =>
      Boolean(day) && all.indexOf(day) === index,
  );

  // The Y axis is as wide as its longest label, so «−25 тис.» stays on one
  // line. recharts rounds the extremes up to "nice" ticks, hence the ×1.5
  // probes; the explicit ticks, when given, are measured as they are.
  const values = points.map((point) => point.value);
  const probes = yTicks ?? [
    Math.min(0, ...values) * 1.5,
    Math.max(0, ...values) * 1.5,
  ];
  const longest = Math.max(...probes.map((value) => formatTick(value).length));
  const yAxisWidth = Math.min(
    Y_AXIS_MAX,
    Math.max(Y_AXIS_MIN, Math.ceil(longest * CHAR_WIDTH) + Y_AXIS_GAP),
  );

  return (
    <figure className="m-0 flex flex-col gap-1" data-slot="daily-bar-chart">
      <figcaption className="sr-only">{summary}</figcaption>
      <ResponsiveContainer
        width="100%"
        height={height}
        initialDimension={{ width: 640, height }}
      >
        <BarChart
          data={points as DailyPoint[]}
          // Room above the top tick, whose label is centred on the plot edge.
          margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={2}
        >
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            hide={!showDays}
            ticks={dayTicks}
            interval={0}
            tickLine={false}
            axisLine={false}
            // Own <text>: the first label anchored at its start and the last
            // at its end, so neither runs off the plot edge.
            tick={({ x, y, payload }: TickProps) => (
              <text
                x={x}
                y={y}
                dy={12}
                textAnchor={
                  payload.value === first
                    ? "start"
                    : payload.value === last
                      ? "end"
                      : "middle"
                }
                {...AXIS_TEXT}
              >
                {formatDayShort(String(payload.value))}
              </text>
            )}
          />
          <YAxis
            width={yAxisWidth}
            ticks={yTicks}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            // Own <text>: recharts' tick wraps at spaces to fit its width,
            // which broke «50 тис.» into two lines.
            tick={({ x, y, payload }: TickProps) => (
              <text x={x} y={y} dy={4} textAnchor="end" {...AXIS_TEXT}>
                {formatTick(Number(payload.value))}
              </text>
            )}
          />
          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
          <Tooltip
            cursor={{ fill: "var(--color-muted)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as DailyPoint | undefined;
              if (!active || !point) return null;
              return renderTooltip(
                points.findIndex((entry) => entry.date === point.date),
              );
            }}
          />
          <Bar dataKey="value" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {points.map((point) => (
              <Cell
                key={point.date}
                fill={
                  point.value < 0
                    ? "var(--color-destructive)"
                    : "var(--color-primary)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
