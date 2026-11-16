"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { dict } from "@/shared/config";
import { downloadCsv } from "@/shared/lib/download-csv";
import { Button } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import type { CsvFile } from "../lib/csv";

const d = dict.analytics;

export interface CsvButtonProps {
  /** The report's title — the button's accessible name says which file. */
  title: string;
  /**
   * Builds the file from what is on screen. `null` while there is nothing to
   * export (loading, failed) — the button is then disabled. May be async
   * (TASK-2395: the money-flow register fetches every page first); the button
   * stays disabled until the file is saved or has failed.
   */
  build: (() => CsvFile | Promise<CsvFile>) | null;
}

/**
 * «CSV» on a report card (TASK-691; `.btn.b-sm.b-out` in the artboard). Saves
 * exactly the figures the card shows; the visible word stays «CSV» and the
 * name says whose («Завантажити CSV: Продажі»). A file that cannot be built —
 * a figure that failed the numeric guard — is a toast, not a broken download.
 */
export function CsvButton({ title, build }: CsvButtonProps) {
  const [busy, setBusy] = useState(false);

  function handleClick() {
    if (!build || busy) return;
    let result: CsvFile | Promise<CsvFile>;
    try {
      result = build();
      if (!(result instanceof Promise)) {
        downloadCsv(result.csv, result.filename);
        return;
      }
    } catch {
      toast.error(d.csvError);
      return;
    }
    setBusy(true);
    result
      .then(({ csv, filename }) => downloadCsv(csv, filename))
      .catch(() => toast.error(d.csvError))
      .finally(() => setBusy(false));
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 md:min-h-8"
      aria-label={d.csvAria(title)}
      aria-busy={busy || undefined}
      disabled={build === null || busy}
      onClick={handleClick}
    >
      <Download aria-hidden="true" />
      {d.csvButton}
    </Button>
  );
}
