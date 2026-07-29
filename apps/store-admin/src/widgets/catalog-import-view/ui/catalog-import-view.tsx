"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  getCatalogImportControllerFindOneQueryKey,
  useCatalogImportControllerApply,
  useCatalogImportControllerCancel,
  useCatalogImportControllerFindOne,
  useCatalogImportControllerList,
  useCatalogImportControllerUpload,
} from "@/shared/api";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
import { Badge, Button, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";
import { asPlan } from "../model/plan-types";
import { useImportDecisions } from "../model/use-import-decisions";
import { ImportPlanReview } from "./import-plan-review";

/** How often the screen polls while the worker is writing. */
const PROGRESS_POLL_MS = 2000;

/**
 * CatalogImportView (TASK-360) — upload → review → apply, on one screen.
 *
 * The two steps are separate on purpose: uploading only PARSES and diffs, and
 * nothing reaches the catalogue until the operator confirms. One file can
 * rewrite the entire shop, so "see exactly what will change" is the feature.
 *
 * While the run is being written the screen polls its progress rather than
 * holding a request open — the API applies the plan in chunks on a worker, so
 * closing this tab does not abandon the import.
 */
export function CatalogImportView() {
  const d = dict.catalogImport;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const decisions = useImportDecisions();
  const upload = useCatalogImportControllerUpload();
  const apply = useCatalogImportControllerApply();
  const cancel = useCatalogImportControllerCancel();

  const runQuery = useCatalogImportControllerFindOne(runId ?? "", {
    query: {
      enabled: runId !== null,
      // Poll only while there is something to watch; a settled run is static.
      refetchInterval: (query) =>
        query.state.data?.data?.status === "APPLYING"
          ? PROGRESS_POLL_MS
          : false,
    },
  });

  const history = useCatalogImportControllerList({ limit: "10" });
  const run = runQuery.data?.data;
  const plan = asPlan(run?.plan);

  const handleUpload = (event: React.FormEvent) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setFileName(file.name);
    upload.mutate(
      { data: { file } },
      {
        onSuccess: (response) => {
          decisions.reset();
          setDuplicateOf(response.duplicateOf ?? null);
          setRunId(response.data.id);
          // Seed the detail cache from the upload response so the review renders
          // immediately instead of flashing a spinner for a plan we already hold.
          queryClient.setQueryData(
            getCatalogImportControllerFindOneQueryKey(response.data.id),
            response,
          );
        },
        onError: () => toast.error(d.uploadFailed),
      },
    );
  };

  const handleApply = () => {
    if (!runId || !plan) return;
    const actionable =
      plan.counts.create + plan.counts.update + plan.counts.missing;
    if (!window.confirm(d.applyConfirm(actionable))) return;

    apply.mutate(
      { id: runId, data: decisions.toPayload() },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getCatalogImportControllerFindOneQueryKey(runId),
          });
        },
        onError: () => toast.error(d.applyFailed),
      },
    );
  };

  const handleCancel = () => {
    if (!runId || !window.confirm(d.cancelConfirm)) return;
    cancel.mutate(
      { id: runId },
      {
        onSuccess: () => {
          toast.success(d.cancelled);
          reset();
        },
      },
    );
  };

  const reset = () => {
    setRunId(null);
    setDuplicateOf(null);
    setFileName(null);
    decisions.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const finishRun = () => {
    void queryClient.invalidateQueries({
      queryKey: getProductControllerAdminFindAllQueryKey(),
    });
    reset();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {d.heading}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{d.intro}</p>
      </div>

      {/* ─── Step 1: upload ─────────────────────────────────────────────── */}
      {runId === null && (
        <form
          onSubmit={handleUpload}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-5 shadow-card"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            aria-label={d.pickFile}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {upload.isPending ? d.uploading : d.upload}
          </Button>
        </form>
      )}

      {/* ─── Step 2: review ─────────────────────────────────────────────── */}
      {runId !== null && runQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{d.uploading}</p>
      )}

      {runId !== null && runQuery.isError && (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      )}

      {run && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-foreground">
              {fileName ?? run.filename}
            </span>
            <Badge variant="secondary">
              {d.status[run.status] ?? run.status}
            </Badge>
          </div>

          {duplicateOf && run.status === "PARSED" && (
            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {d.duplicateWarning}
            </p>
          )}

          {run.status === "PARSED" && plan && (
            <>
              <ImportPlanReview plan={plan} decisions={decisions} />
              <Separator />
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleApply}
                  disabled={apply.isPending}
                >
                  {apply.isPending ? d.applying : d.apply}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={cancel.isPending}
                >
                  {d.cancel}
                </Button>
              </div>
            </>
          )}

          {run.status === "APPLYING" && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Loader2
                  className="size-4 animate-spin text-primary"
                  aria-hidden="true"
                />
                {d.progress(run.appliedRows, run.totalRows)}
              </p>
              <div
                role="progressbar"
                aria-valuenow={run.appliedRows}
                aria-valuemin={0}
                aria-valuemax={run.totalRows}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${run.totalRows > 0 ? Math.round((run.appliedRows / run.totalRows) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {run.status === "APPLIED" && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <CheckCircle2
                  className="size-5 text-success"
                  aria-hidden="true"
                />
                {d.doneHeading}
              </p>
              <p className="text-sm text-muted-foreground">{d.doneHint}</p>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/products">{d.toStore}</Link>
                </Button>
                <Button type="button" variant="outline" onClick={finishRun}>
                  {d.startOver}
                </Button>
              </div>
            </div>
          )}

          {run.status === "FAILED" && (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-card p-5">
              <p className="font-medium text-destructive">{d.failedHeading}</p>
              {run.error && (
                <p className="text-sm text-muted-foreground">{run.error}</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={reset}
              >
                {d.startOver}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── History ────────────────────────────────────────────────────── */}
      <Separator />
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-foreground">
          {d.historyHeading}
        </h3>
        {(history.data?.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(history.data?.data ?? []).map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm"
              >
                <span className="font-medium text-foreground">
                  {entry.filename}
                </span>
                <Badge variant="secondary">
                  {d.status[entry.status] ?? entry.status}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
                {entry.actorEmail && (
                  <span className="text-muted-foreground">
                    {entry.actorEmail}
                  </span>
                )}
                <span className="ml-auto tabular-nums text-muted-foreground">
                  +{entry.createCount} / ~{entry.updateCount} / −
                  {entry.missingCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
