"use client";

import { useId, useState, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { ChevronDownIcon } from "lucide-react";
import { Input, Label, SingleImageUpload } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import {
  CONTENT_IMAGE_ACCEPT,
  type ImageUploadCopy,
} from "@/shared/lib/image-upload-error";

export interface ContentImageFieldProps {
  /**
   * DOM id for the URL text input. It stays the field's id (not the uploader's)
   * so `<Label htmlFor>` keeps naming the input an operator can type into, and so
   * `getByLabelText(…)` in the existing form tests still finds it.
   */
  id: string;
  /** Field label — the entity's own wording («Обкладинка», «Логотип»…). */
  label: string;
  /** Placeholder for the URL input. */
  urlPlaceholder: string;
  copy: ImageUploadCopy;
  /** Current field value: an uploaded URL, a pasted link, or "". */
  value: string;
  /** `register()` result for the URL input. */
  urlInput: UseFormRegisterReturn;
  onSelectFile: (file: File) => void;
  /** Clears the field. Does NOT delete the stored file — see below. */
  onRemove: () => void;
  isUploading: boolean;
  uploadError: string | null;
  /** zod/RHF validation message for the field. */
  fieldError?: string;
  /**
   * The media-library picker for this field (TASK-441) — normally
   * `<MediaPicker onPick={asset => setValue(name, asset.url)} />`.
   *
   * A SLOT and not a built-in, for two reasons. The form owns `setValue`, so
   * only the form can say where a picked URL goes; and the picker renders
   * nothing at all for an operator holding neither media key, which is what
   * keeps this field working unchanged for them — the upload control and the
   * URL box below are still the whole feature.
   */
  picker?: ReactNode;
  /**
   * Whether this session may upload through the route the form wired in
   * (TASK-728). Defaults to true — every content form's upload route needs the
   * same key as the form itself. The product OG field uploads through the media
   * library (`media:write`), which a product editor may lack; for them the
   * uploader is NOT RENDERED (a control that can only answer 403 is not
   * offered), and the picker slot and the URL box stay the whole field.
   */
  canUpload?: boolean;
  /**
   * `"inline"` (wave 198, BrandsProposal БР5): the picker sits in the upload
   * button's row, and the URL box folds under a «{label}» disclosure — `label`
   * then names the URL box only (the section card names the field), so the
   * label never points at the wrong control. It opens by itself while the
   * field has an error. Default `"stacked"` — the layout every other form has.
   */
  layout?: "stacked" | "inline";
}

/**
 * One image field for a content form: upload a file, or paste a link (TASK-424).
 *
 * BOTH, deliberately. The four content forms used to offer only the URL box,
 * which left an operator holding a photo on their laptop with nowhere to put it —
 * but the URL box is not legacy: operators do host imagery on an external CDN,
 * and `NEXT_PUBLIC_IMAGE_HOSTS` exists so the storefront can render it. Removing
 * it to "clean up" would break those stores.
 *
 * REMOVING IS NOT DELETING. `onRemove` clears the form field; the stored file
 * stays in `/uploads/content/`. That is honest rather than lazy: the value may be
 * an external URL that is not ours to delete, the same upload may be referenced
 * by another row, and nothing is saved until the operator submits the form — a
 * delete fired from here would destroy the image of a form the operator then
 * abandons. Reclaiming orphaned uploads is the media library's job (plan 177).
 */
export function ContentImageField({
  id,
  label,
  urlPlaceholder,
  copy,
  value,
  urlInput,
  onSelectFile,
  onRemove,
  isUploading,
  uploadError,
  fieldError,
  picker,
  canUpload = true,
  layout = "stacked",
}: ContentImageFieldProps) {
  if (layout === "inline") {
    return (
      <InlineContentImageField
        {...{
          id,
          label,
          urlPlaceholder,
          copy,
          value,
          urlInput,
          onSelectFile,
          onRemove,
          isUploading,
          uploadError,
          fieldError,
          picker,
          canUpload,
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>

      {canUpload && (
        <SingleImageUpload
          imageUrl={value.trim() ? value : null}
          accept={CONTENT_IMAGE_ACCEPT}
          labels={{
            alt: copy.alt,
            empty: copy.empty,
            upload: copy.upload,
            replace: copy.replace,
            delete: copy.remove,
            deleteTitle: copy.removeTitle,
            deleteDescription: copy.removeDescription,
            cancel: dict.common.cancel,
            confirmDelete: copy.remove,
          }}
          hint={copy.hint}
          error={uploadError}
          isUploading={isUploading}
          onSelectFile={onSelectFile}
          onDelete={onRemove}
        />
      )}

      {/* Between the uploader and the URL box, because that is the order the
          three paths rank in: a picture the shop already has, a file on this
          laptop, a link from somewhere else. */}
      {picker}

      <Input id={id} placeholder={urlPlaceholder} {...urlInput} />

      {fieldError && (
        <p role="alert" className="text-sm text-destructive">
          {fieldError}
        </p>
      )}
    </div>
  );
}

/** The `layout="inline"` arrangement — see the prop's note. */
function InlineContentImageField({
  id,
  label,
  urlPlaceholder,
  copy,
  value,
  urlInput,
  onSelectFile,
  onRemove,
  isUploading,
  uploadError,
  fieldError,
  picker,
  canUpload = true,
}: Omit<ContentImageFieldProps, "layout">) {
  const [urlOpenState, setUrlOpen] = useState(false);
  const regionId = useId();
  // An error in the URL box must be visible — so the fold opens for it.
  const urlOpen = urlOpenState || Boolean(fieldError);
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-3">
      {canUpload ? (
        <SingleImageUpload
          imageUrl={value.trim() ? value : null}
          accept={CONTENT_IMAGE_ACCEPT}
          labels={{
            alt: copy.alt,
            empty: copy.empty,
            upload: copy.upload,
            replace: copy.replace,
            delete: copy.remove,
            deleteTitle: copy.removeTitle,
            deleteDescription: copy.removeDescription,
            cancel: dict.common.cancel,
            confirmDelete: copy.remove,
          }}
          hint={copy.hint}
          error={uploadError}
          isUploading={isUploading}
          onSelectFile={onSelectFile}
          onDelete={onRemove}
          actions={picker}
        />
      ) : (
        picker
      )}

      <div className="flex flex-col gap-2 border-t pt-3">
        <button
          type="button"
          aria-expanded={urlOpen}
          aria-controls={regionId}
          onClick={() => setUrlOpen(!urlOpen)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
        >
          {label}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              urlOpen && "rotate-180",
            )}
          />
        </button>
        <div id={regionId} hidden={!urlOpen}>
          <Label htmlFor={id} className="sr-only">
            {label}
          </Label>
          <Input
            id={id}
            placeholder={urlPlaceholder}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            {...urlInput}
          />
        </div>
        {fieldError && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {fieldError}
          </p>
        )}
      </div>
    </div>
  );
}
