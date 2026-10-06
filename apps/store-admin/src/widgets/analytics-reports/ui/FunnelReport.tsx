"use client";

import { ArrowDownRight, RefreshCw } from "lucide-react";

import {
  useGetFunnelReport,
  type FunnelReportEntity,
} from "@/entities/analytics";
import { dict } from "@/shared/config";
import { formatTime } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import { formatCount, formatRate } from "../lib/format";
import type { ReportQuery } from "../model/report-period";
import { DeltaBadge } from "./DeltaBadge";
import { ReportCard } from "./ReportCard";
import { NoticeBox, ReportBodySkeleton, ReportLoadError } from "./report-parts";

const d = dict.analytics;

type FunnelEventName = "add_to_cart" | "begin_checkout" | "purchase";

const STEP_LABEL: Record<FunnelEventName, string> = {
  add_to_cart: d.stepAddToCart,
  begin_checkout: d.stepBeginCheckout,
  purchase: d.stepPurchase,
};

/** The sentence under a step, by where the transition leads. */
const transitionText = (to: FunnelEventName) =>
  to === "purchase" ? d.toPurchase : d.toCheckout;

/**
 * «Конверсія кошик → покупка» (TASK-692, ДН-8.1/8.5/8.6). Umami's events,
 * never mixed with our orders — which the subtitle says. Three states that
 * must not look alike: not connected, connected but not answering (with the
 * time it failed and a retry), and the numbers. None of the first two is
 * ever drawn as «0%».
 */
export function FunnelReport({ query }: { query: ReportQuery }) {
  const report = useGetFunnelReport(query);
  const data = report.data?.data;

  return (
    <ReportCard title={d.funnelTitle} subtitle={d.funnelSubtitle}>
      {report.isError ? (
        <ReportLoadError
          onRetry={() => void report.refetch()}
          isRetrying={report.isFetching}
        />
      ) : !data ? (
        <ReportBodySkeleton height="h-36" />
      ) : !data.configured ? (
        <NoticeBox title={d.funnelOffTitle}>{d.funnelOffText}</NoticeBox>
      ) : !data.available || !data.steps ? (
        <NoticeBox
          title={d.funnelDownTitle(formatTime(report.dataUpdatedAt))}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 text-foreground md:min-h-8"
              disabled={report.isFetching}
              onClick={() => void report.refetch()}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn(
                  report.isFetching &&
                    "animate-spin motion-reduce:animate-none",
                )}
              />
              {d.funnelRetry}
            </Button>
          }
        >
          {d.funnelDownText}
        </NoticeBox>
      ) : (
        <FunnelBody data={data} steps={data.steps} />
      )}
    </ReportCard>
  );
}

function FunnelBody({
  data,
  steps,
}: {
  data: FunnelReportEntity;
  steps: NonNullable<FunnelReportEntity["steps"]>;
}) {
  const transitions = data.transitions ?? [];
  const base = steps[0]?.count.current ?? 0;

  // Percentage points: a change of a rate is not a percent of a percent.
  const changePp =
    data.conversion !== null && data.previousConversion !== null
      ? Math.round((data.conversion - data.previousConversion) * 1000) / 10
      : null;

  // «Найбільше губимо тут» — the weakest step, when the steps differ at all.
  const rates = transitions
    .map((transition) => transition.rate)
    .filter((rate): rate is number => rate !== null);
  const worstRate = new Set(rates).size > 1 ? Math.min(...rates) : undefined;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-2xl font-bold tabular-nums text-foreground">
          <span className="sr-only">{`${d.funnelConversion}: `}</span>
          {formatRate(data.conversion)}
        </span>
        <DeltaBadge changePct={changePp} unit="pp" />
        <span className="text-xs text-muted-foreground">
          {d.funnelWas(formatRate(data.previousConversion))}
        </span>
      </div>

      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => {
          const share = base > 0 ? (step.count.current / base) * 100 : 0;
          const transition = transitions.find(
            (entry) => entry.from === step.event,
          );
          const isWorst =
            transition?.rate !== null &&
            transition?.rate !== undefined &&
            transition.rate === worstRate;
          return (
            <li key={step.event} className="flex flex-col gap-2.5">
              {/* Phone: name and count on one line, the bar under them;
                  from md: name · bar · count, as in `.fn-r`. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm md:flex-nowrap">
                <span className="order-1 min-w-0 flex-1 md:w-40 md:flex-none">
                  {STEP_LABEL[step.event]}
                </span>
                <span className="order-2 w-24 text-right font-semibold tabular-nums md:order-3">
                  {formatCount(step.count.current)}
                </span>
                <span
                  aria-hidden="true"
                  className="order-3 h-5.5 basis-full md:order-2 md:flex-1 md:basis-auto"
                >
                  <span
                    className="block h-full rounded-sm bg-primary"
                    style={{ width: `${share}%` }}
                  />
                </span>
              </div>
              {transition && index < steps.length - 1 ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground md:pl-43">
                  <ArrowDownRight aria-hidden="true" className="size-3.5" />
                  <span>
                    {transitionText(transition.to)(
                      formatRate(transition.rate),
                      formatRate(transition.previousRate),
                    )}
                    {isWorst ? d.biggestLoss : null}
                  </span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-muted-foreground">{d.funnelEventsNote}</p>
    </>
  );
}
