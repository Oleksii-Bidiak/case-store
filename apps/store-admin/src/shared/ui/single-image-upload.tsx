"use client";

/**
 * SingleImageUpload — the shared "one image, replace or remove" control
 * (TASK-299). Dumb by contract: it owns no mutation, no query and no copy. The
 * caller passes the current URL, the accepted extensions, every label, and gets
 * back a picked `File` / a confirmed delete.
 *
 * Hoisted to `shared/ui` because it is the second uploader in the project (after
 * `features/product-image-manager`, which stays bespoke — that one is a
 * multi-image gallery with reorder + primary-image selection, a different
 * interaction). Anything that manages exactly ONE image (store logo, and later a
 * brand logo or a category cover) should reuse this.
 */

import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

export interface SingleImageUploadLabels {
  /** Alt text for the preview image. */
  alt: string;
  /** Shown in place of the preview when no image is set. */
  empty: string;
  /** Picker button label when no image is set. */
  upload: string;
  /** Picker button label when an image is already set. */
  replace: string;
  /** Delete button label. */
  delete: string;
  deleteTitle: string;
  deleteDescription: string;
  /** Confirm-dialog buttons. */
  cancel: string;
  confirmDelete: string;
}

export interface SingleImageUploadProps {
  /** Current image URL, or `null` when none is set. */
  imageUrl: string | null;
  /** `accept` attribute for the file input (e.g. ".svg,.png,.webp,.jpg"). */
  accept: string;
  labels: SingleImageUploadLabels;
  /** Called with the picked file. The caller runs the upload mutation. */
  onSelectFile: (file: File) => void;
  /** Called after the admin confirms the delete dialog. */
  onDelete: () => void;
  isUploading?: boolean;
  isDeleting?: boolean;
  /** Format/size guidance rendered under the controls. */
  hint?: ReactNode;
  /** Server-side failure message, rendered as an alert. */
  error?: string | null;
}

export function SingleImageUpload({
  imageUrl,
  accept,
  labels,
  onSelectFile,
  onDelete,
  isUploading = false,
  isDeleting = false,
  hint,
  error,
}: SingleImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const busy = isUploading || isDeleting;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input straight away so re-picking the SAME file after a failed
    // upload still fires `change` (the value would otherwise be unchanged).
    event.target.value = "";
    if (file) {
      onSelectFile(file);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-2">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={labels.alt}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImagePlus
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ImagePlus />
              )}
              {imageUrl ? labels.replace : labels.upload}
            </Button>

            {imageUrl && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setIsConfirmingDelete(true)}
              >
                {isDeleting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 className="text-destructive" />
                )}
                {labels.delete}
              </Button>
            )}
          </div>

          {!imageUrl && (
            <p className="text-sm text-muted-foreground">{labels.empty}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          data-testid="single-image-upload-input"
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Dialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.deleteTitle}</DialogTitle>
            <DialogDescription>{labels.deleteDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {labels.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                setIsConfirmingDelete(false);
                onDelete();
              }}
            >
              {isDeleting && <Loader2 className="animate-spin" />}
              {labels.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
