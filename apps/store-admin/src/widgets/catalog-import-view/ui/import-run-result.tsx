"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  CircleCheckIcon,
  Loader2Icon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CatalogImportRunEntity } from "@/shared/api";
import { Button } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { cn } from "@/shared/lib";
import { dict } from "@/shared/config";
import { humanImportError } from "../model/plan-summary";

const d = dict.catalogImport;

/** «Записуємо 412 з 1 297» with a bar (ІК11). Polled by the caller. */
export function ImportProgress({ run }: { run: CatalogImportRunEntity }) {
  const share =
    run.totalRows > 0 ? Math.round((run.appliedRows / run.totalRows) * 100) : 0;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-card">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Loader2Icon
          aria-hidden="true"
          className="size-4 animate-spin text-primary motion-reduce:animate-none"
        />
        {d.progress(run.appliedRows, run.totalRows)}
      </p>
      <div
        role="progressbar"
        aria-label={d.progress(run.appliedRows, run.totalRows)}
        aria-valuenow={run.appliedRows}
        aria-valuemin={0}
        aria-valuemax={run.totalRows}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none"
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{d.progressHint}</p>
    </div>
  );
}

export interface WrittenFigures {
  created: number;
  updated: number;
  hidden: number;
  skipped: number;
  /** Hand edits the operator kept — known only for a run reviewed here. */
  keptEdits: number | null;
  /**
   * The figures are the file's PLAN at parse time, not what was written: a
   * run opened from the history has lost the operator's unticked rows, and
   * the API stores only the planned counts (actual counts — TASK-1741).
   */
  planned: boolean;
}

/** What was written, and where to go next (ІК12). */
export function ImportDone({
  figures,
  onStartOver,
}: {
  figures: WrittenFigures;
  onStartOver: () => void;
}) {
  const items: Array<{ value: number; label: string; tone?: string }> = [
    { value: figures.created, label: d.doneCreated },
    {
      value: figures.updated,
      label:
        figures.keptEdits && figures.keptEdits > 0
          ? d.doneUpdatedKept(figures.keptEdits)
          : d.doneUpdated,
    },
    { value: figures.hidden, label: d.doneHidden },
    {
      value: figures.skipped,
      label: d.doneSkipped,
      tone: figures.skipped > 0 ? "text-warning" : undefined,
    },
  ];
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-card">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <CircleCheckIcon aria-hidden="true" className="size-5 text-success" />
        {d.doneHeading}
      </p>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                "font-display text-2xl font-semibold tabular-nums",
                item.tone ?? "text-foreground",
              )}
            >
              {item.value.toLocaleString("uk-UA")}
            </dd>
          </div>
        ))}
      </dl>
      {figures.planned ? (
        <p className="text-sm text-muted-foreground">{d.donePlannedNote}</p>
      ) : null}
      <p className="text-sm text-muted-foreground">{d.doneHint}</p>
      <div className="flex flex-wrap gap-3">
        {figures.created > 0 ? (
          <Button asChild>
            <Link href="/products?status=hidden">
              {d.toNewProducts(figures.created)}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant={figures.created > 0 ? "outline" : "default"}>
          <Link href="/products">{d.toStore}</Link>
        </Button>
        <Button type="button" variant="ghost" onClick={onStartOver}>
          {d.startOver}
        </Button>
      </div>
    </div>
  );
}

/**
 * The failure in words, the raw text folded under «Технічні деталі» (ІК13).
 * «Спробувати ще раз» re-parses the same file when this screen still holds it
 * — the API cannot re-apply a failed run, but a fresh parse of the same file
 * plans exactly what is still unwritten (the ledger knows the rest).
 */
export function ImportFailed({
  run,
  onRetry,
  isRetrying,
  onStartOver,
}: {
  run: CatalogImportRunEntity;
  onRetry: () => void;
  isRetrying: boolean;
  onStartOver: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const details = [run.error ?? d.status.FAILED, `run ${run.id.slice(0, 8)}`]
    .filter(Boolean)
    .join(" · ");

  const copy = () => {
    const write = navigator.clipboard?.writeText(details);
    if (!write) {
      toast.error(d.copyFailed);
      return;
    }
    write.then(
      () => toast.success(d.detailsCopied),
      () => toast.error(d.copyFailed),
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-card p-5">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <TriangleAlertIcon aria-hidden="true" className="size-4" />
        {d.failedHeading}
      </p>
      <p className="text-sm text-foreground">{humanImportError(run.error)}</p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((current) => !current)}
          className="self-start rounded-xs text-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {d.techDetails}
        </button>
        {open ? (
          <pre
            id={detailsId}
            className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap text-foreground"
          >
            {details}
          </pre>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onRetry} disabled={isRetrying}>
          <RotateCcwIcon aria-hidden="true" />
          {d.retry}
        </Button>
        <Button type="button" variant="outline" onClick={copy}>
          {d.copyDetails}
        </Button>
        <Button type="button" variant="ghost" onClick={onStartOver}>
          {d.startOver}
        </Button>
      </div>
    </div>
  );
}
