"use client";

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
   * export (loading, failed) — the button is then disabled.
   */
  build: (() => CsvFile) | null;
}

/**
 * «CSV» on a report card (TASK-691; `.btn.b-sm.b-out` in the artboard). Saves
 * exactly the figures the card shows; the visible word stays «CSV» and the
 * name says whose («Завантажити CSV: Продажі»). A file that cannot be built —
 * a figure that failed the numeric guard — is a toast, not a broken download.
 */
export function CsvButton({ title, build }: CsvButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 md:min-h-8"
      aria-label={d.csvAria(title)}
      disabled={build === null}
      onClick={() => {
        if (!build) return;
        try {
          const { csv, filename } = build();
          downloadCsv(csv, filename);
        } catch {
          toast.error(d.csvError);
        }
      }}
    >
      <Download aria-hidden="true" />
      {d.csvButton}
    </Button>
  );
}
