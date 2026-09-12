"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { Input, Label, SingleImageUpload } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  CONTENT_IMAGE_ACCEPT,
  type ImageUploadCopy,
} from "../model/image-upload-copy";

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
}: ContentImageFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>

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

      <Input id={id} placeholder={urlPlaceholder} {...urlInput} />

      {fieldError && (
        <p role="alert" className="text-sm text-destructive">
          {fieldError}
        </p>
      )}
    </div>
  );
}
