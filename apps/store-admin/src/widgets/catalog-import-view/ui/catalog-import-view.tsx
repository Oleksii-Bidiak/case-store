"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheetIcon, InfoIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getCatalogImportControllerFindOneQueryKey,
  getCatalogImportControllerListQueryKey,
  useCatalogImportControllerApply,
  useCatalogImportControllerCancel,
  useCatalogImportControllerFindOne,
  useCatalogImportControllerList,
  useCatalogImportControllerUpload,
} from "@/shared/api";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
import {
  Button,
  Callout,
  RegistryHeader,
  Stepper,
  useConfirmDialog,
  type StepperStep,
} from "@/shared/ui";
import { apiErrorMessage, formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { asPlan } from "../model/plan-types";
import { summarisePlan } from "../model/plan-summary";
import { useImportDecisions } from "../model/use-import-decisions";
import { ImportDropzone } from "./import-dropzone";
import { ImportHistory, ImportStatusBadge } from "./import-history";
import { ImportPlanReview } from "./import-plan-review";
import { ImportDone, ImportFailed, ImportProgress } from "./import-run-result";

const d = dict.catalogImport;

/** How often the screen polls while the worker is writing. */
const PROGRESS_POLL_MS = 2000;
const HISTORY_QUERY = { limit: "10" } as const;

type Step = "file" | "review" | "write";

function stepsFor(step: Step): StepperStep[] {
  const order: Step[] = ["file", "review", "write"];
  const at = order.indexOf(step);
  const titles: Record<Step, string> = {
    file: d.stepFile,
    review: d.stepReview,
    write: d.stepWrite,
  };
  return order.map((id, index) => ({
    id,
    title: titles[id],
    state: index < at ? "done" : index === at ? "now" : "todo",
  }));
}

/**
 * CatalogImportView (TASK-360) — «Файл → Перевірка → Запис» on one screen
 * (wave 198, CatalogImportProposal ІК1–ІК14, TASK-1086).
 *
 * The steps are separate on purpose: uploading only PARSES and diffs, and
 * nothing reaches the catalogue until the operator confirms. One file can
 * rewrite the entire shop, so "see exactly what will change" is the feature.
 *
 * What moved, nothing removed: the native file input became a drop zone with
 * «Обрати файл» that parses the moment a file is chosen (TASK-424); the long
 * feed became tiles + tabs; both `window.confirm`s became AlertDialogs with a
 * summary (TASK-812); «Застосувати» counts what will really be written — the
 * unticked rows included; the history is a table refreshed after every action,
 * and any run in it can be opened again. Every endpoint needs `catalog:import`
 * — the nav entry and the route are gated by it already.
 *
 * While the run is being written the screen polls its progress rather than
 * holding a request open — the API applies the plan in chunks on a worker, so
 * closing this tab does not abandon the import.
 */
export function CatalogImportView() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();

  const [runId, setRunId] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  // The last file sent — «Спробувати ще раз» re-parses it without the picker.
  const lastFileRef = useRef<File | null>(null);

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

  const history = useCatalogImportControllerList(HISTORY_QUERY);
  const runs = history.data?.data ?? [];
  const run = runQuery.data?.data;
  const plan = asPlan(run?.plan);
  const summary = plan ? summarisePlan(plan, decisions) : null;

  const refreshHistory = () =>
    queryClient.invalidateQueries({
      queryKey: getCatalogImportControllerListQueryKey(),
    });

  // The history must say what just happened — a run that finished writing or
  // stopped while the operator watched included (staleTime is 5 min).
  const runStatus = run?.status;
  useEffect(() => {
    if (runStatus) {
      void queryClient.invalidateQueries({
        queryKey: getCatalogImportControllerListQueryKey(),
      });
    }
  }, [runStatus, queryClient]);

  const reset = () => {
    setRunId(null);
    setDuplicateOf(null);
    decisions.reset();
  };

  const openRun = (id: string) => {
    decisions.reset();
    setDuplicateOf(null);
    setRunId(id);
  };

  const handleFile = (file: File) => {
    lastFileRef.current = file;
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
          void refreshHistory();
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error) ?? d.uploadFailed),
      },
    );
  };

  const handleApply = async () => {
    if (!runId || !summary) return;
    const confirmed = await confirm({
      title: d.applyTitle(summary.positions),
      description: (
        <>
          {summary.creates > 0 ? (
            <ConfirmLine>{d.applyCreates(summary.creates)}</ConfirmLine>
          ) : null}
          {summary.updates > 0 ? (
            <ConfirmLine>
              {d.applyUpdates(summary.updates, summary.keptEdits)}
            </ConfirmLine>
          ) : null}
          {summary.missing > 0 ? (
            <ConfirmLine>{d.applyMissing(summary.missing)}</ConfirmLine>
          ) : null}
          <span className="mt-2 block text-xs">
            {d.applyFootnote(summary.updates, summary.missing)}
          </span>
        </>
      ),
      confirmLabel: d.apply,
    });
    if (!confirmed) return;

    apply.mutate(
      { id: runId, data: decisions.toPayload() },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getCatalogImportControllerFindOneQueryKey(runId),
          });
          void refreshHistory();
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error) ?? d.applyFailed),
      },
    );
  };

  const handleCancel = async () => {
    if (!runId || !run) return;
    const confirmed = await confirm({
      title: d.cancelTitle(run.filename),
      description: d.cancelDescription,
      confirmLabel: d.cancelAction,
      destructive: true,
    });
    if (!confirmed) return;
    cancel.mutate(
      { id: runId },
      {
        onSuccess: () => {
          toast.success(d.cancelled);
          reset();
          void refreshHistory();
        },
      },
    );
  };

  const finishRun = () => {
    void queryClient.invalidateQueries({
      queryKey: getProductControllerAdminFindAllQueryKey(),
    });
    reset();
  };

  const retry = () => {
    const file = lastFileRef.current;
    if (file) {
      handleFile(file);
    } else {
      reset();
    }
  };

  const step: Step =
    run && run.status !== "PARSED" && run.status !== "CANCELLED"
      ? "write"
      : runId !== null
        ? "review"
        : "file";

  const earlier = duplicateOf
    ? runs.find((entry) => entry.id === duplicateOf)
    : undefined;
  const nothingToApply = summary !== null && summary.positions === 0;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <RegistryHeader title={d.heading} description={d.intro} />
      <Stepper
        aria-label={d.stepsAria}
        steps={stepsFor(step)}
        className="flex flex-wrap gap-2"
      />

      {runId === null ? (
        <ImportDropzone onFile={handleFile} isUploading={upload.isPending} />
      ) : null}

      {runId !== null && runQuery.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {d.uploading}
        </p>
      ) : null}

      {runId !== null && runQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : null}

      {run ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2 font-semibold text-foreground">
              <FileSpreadsheetIcon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              {run.filename}
            </span>
            {run.status === "PARSED" && nothingToApply && duplicateOf ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {d.noChangesBadge}
              </span>
            ) : (
              <ImportStatusBadge status={run.status} />
            )}
            <span className="text-xs text-muted-foreground">
              {d.parsedMeta(formatDateTime(run.createdAt), run.actorEmail)}
            </span>
          </div>

          {run.status === "PARSED" && duplicateOf && nothingToApply ? (
            <Callout
              variant="primary"
              icon={
                <InfoIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />
              }
            >
              {earlier
                ? d.noChanges(
                    formatDateTime(earlier.appliedAt ?? earlier.createdAt),
                  )
                : d.duplicateWarning}{" "}
              <button
                type="button"
                onClick={() => openRun(duplicateOf)}
                className="rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {d.openThatImport}
              </button>
            </Callout>
          ) : null}

          {run.status === "PARSED" && duplicateOf && !nothingToApply ? (
            <Callout variant="warning">{d.duplicateWarning}</Callout>
          ) : null}

          {run.status === "PARSED" &&
          plan &&
          !(duplicateOf && nothingToApply) ? (
            <ImportPlanReview plan={plan} decisions={decisions} />
          ) : null}

          {run.status === "PARSED" && summary ? (
            <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background px-4 py-2.5 shadow-bar lg:-mx-6 lg:px-6 lg:py-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleCancel()}
                disabled={cancel.isPending || apply.isPending}
              >
                {d.rejectButton}
              </Button>
              <p className="ml-auto hidden text-sm text-muted-foreground md:block">
                {[
                  d.barPositions(summary.positions),
                  summary.keptEdits > 0 ? d.barKeep(summary.keptEdits) : null,
                  summary.skipped > 0 ? d.barSkip(summary.skipped) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <Button
                type="button"
                className="max-md:ml-auto"
                onClick={() => void handleApply()}
                disabled={apply.isPending || summary.positions === 0}
              >
                {apply.isPending
                  ? d.applying
                  : d.applyButton(summary.positions)}
              </Button>
            </div>
          ) : null}

          {run.status === "APPLYING" ? <ImportProgress run={run} /> : null}

          {run.status === "APPLIED" ? (
            <ImportDone
              figures={{
                created: summary?.creates ?? run.createCount,
                updated: summary?.updates ?? run.updateCount,
                hidden: summary?.missing ?? run.missingCount,
                skipped: run.errorCount,
                keptEdits: summary?.keptEdits ?? null,
              }}
              onStartOver={finishRun}
            />
          ) : null}

          {run.status === "FAILED" ? (
            <ImportFailed
              run={run}
              onRetry={retry}
              isRetrying={upload.isPending}
              onStartOver={reset}
            />
          ) : null}

          {run.status === "CANCELLED" ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={reset}
            >
              {d.startOver}
            </Button>
          ) : null}
        </div>
      ) : null}

      <ImportHistory
        runs={runs}
        isLoading={history.isLoading}
        isError={history.isError}
        onRetry={() => void history.refetch()}
        onOpen={openRun}
      />

      {confirmDialog}
    </div>
  );
}

/** One «✓ …» line of the apply summary — a span: the dialog text is a `<p>`. */
function ConfirmLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2 text-foreground">
      <span aria-hidden="true" className="text-success">
        ✓
      </span>
      <span>{children}</span>
    </span>
  );
}
