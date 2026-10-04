"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheetIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { Button, FieldError } from "@/shared/ui";
import { cn } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.catalogImport;

/** Whether a drag carries files from the desktop (not text, not a link). */
const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

/** `.xlsx` by name — the API checks the name AND the MIME type again. */
export const isXlsx = (file: File) => file.name.toLowerCase().endsWith(".xlsx");

interface ImportDropzoneProps {
  /** A file the operator chose or dropped — already checked to be `.xlsx`. */
  onFile: (file: File) => void;
  isUploading: boolean;
}

/**
 * The «Файл» step (CatalogImportProposal ІК1–ІК3, TASK-424): a dashed zone a
 * file can be dropped on, with «Обрати файл» for the picker. The native file
 * input stays in the DOM (hidden) — it is what the button opens, and what a
 * screen reader or a test reaches through its label. Parsing starts the moment
 * a file is chosen: the old «Розібрати файл» button was one more click that
 * did nothing but confirm the choice just made.
 */
export function ImportDropzone({ onFile, isUploading }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [wrongType, setWrongType] = useState(false);
  const errorId = useId();
  const hintId = useId();

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!isXlsx(file)) {
      setWrongType(true);
      return;
    }
    setWrongType(false);
    onFile(file);
  };

  return (
    <div
      data-testid="import-dropzone"
      onDragEnter={(event) => {
        if (!carriesFiles(event) || isUploading) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event) || isUploading) return;
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        // Leaving for a child is not leaving the zone.
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        if (!isUploading) take(event.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors",
        dragging ? "border-primary bg-primary/6" : "border-border bg-card",
      )}
    >
      {isUploading ? (
        <>
          <Loader2Icon
            aria-hidden="true"
            className="size-6 animate-spin text-primary motion-reduce:animate-none"
          />
          <p role="status" className="font-semibold text-foreground">
            {d.uploading}
          </p>
          <p className="text-sm text-muted-foreground">{d.dropReleaseHint}</p>
        </>
      ) : dragging ? (
        <>
          <FileSpreadsheetIcon
            aria-hidden="true"
            className="size-6 text-primary"
          />
          <p className="font-semibold text-foreground">{d.dropRelease}</p>
          <p className="text-sm text-muted-foreground">{d.dropReleaseHint}</p>
        </>
      ) : (
        <>
          <UploadIcon aria-hidden="true" className="size-6 text-foreground" />
          <p className="font-semibold text-foreground">{d.dropTitle}</p>
          <p className="text-sm text-muted-foreground">{d.dropSubtitle}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-1"
            aria-describedby={wrongType ? `${hintId} ${errorId}` : hintId}
            onClick={() => inputRef.current?.click()}
          >
            <FileSpreadsheetIcon aria-hidden="true" />
            {d.pickFile}
          </Button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        aria-label={d.pickFile}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files?.[0]);
          // The same file chosen again must fire `change` again (a retry).
          event.target.value = "";
        }}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {d.dropHint}
      </p>
      <FieldError id={errorId}>{wrongType ? d.wrongType : null}</FieldError>
    </div>
  );
}
