"use client";

import { useState } from "react";
import { toast } from "@/shared/ui/toast";
import {
  imageUploadErrorMessage,
  type ImageUploadCopy,
} from "@/shared/lib/image-upload-error";

/**
 * The shape of an Orval upload mutation, narrowed to what this hook uses.
 *
 * Structural rather than the generated `UseMutationResult`: the four content
 * routes produce four distinct (but identical) body types, and naming one of
 * them here would make the hook usable by one caller.
 */
export interface ImageUploadMutation {
  mutateAsync: (variables: {
    data: { file: Blob };
  }) => Promise<{ data: { url: string } }>;
  isPending: boolean;
}

export interface ImageUploadFieldState {
  onSelectFile: (file: File) => void;
  isUploading: boolean;
  uploadError: string | null;
}

/**
 * Wire one of the `POST /api/admin/uploads/*` mutations to a form field
 * (TASK-424).
 *
 * The uploaded URL is handed to `onUploaded` rather than written here: the field
 * belongs to a react-hook-form form, and the only correct way to put a value into
 * one is the form's own `setValue` (`docs/conventions/forms.md`). A local copy of
 * the URL in this hook would be a second source of truth that a background
 * refetch or an id-keyed `reset()` could silently disagree with.
 *
 * The failure is kept in state AND toasted: the toast tells the operator
 * something happened, and the inline message survives on screen while they pick a
 * different file.
 */
export function useImageUploadField({
  upload,
  copy,
  onUploaded,
}: {
  upload: ImageUploadMutation;
  copy: ImageUploadCopy;
  onUploaded: (url: string) => void;
}): ImageUploadFieldState {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onSelectFile = (file: File) => {
    setUploadError(null);
    upload
      .mutateAsync({ data: { file } })
      .then((response) => {
        onUploaded(response.data.url);
        toast.success(copy.toastUploaded);
      })
      .catch((error: unknown) => {
        const message = imageUploadErrorMessage(error, copy);
        setUploadError(message);
        toast.error(message);
      });
  };

  return { onSelectFile, isUploading: upload.isPending, uploadError };
}
