"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getSeoSettingsControllerGetSettingsQueryKey,
  useAdminSeoSettingsControllerDeleteLogo,
  useAdminSeoSettingsControllerUploadLogo,
} from "@/entities/seo-settings";
import { SingleImageUpload } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  LOGO_ACCEPT,
  logoUploadErrorMessage,
} from "../model/logo-upload-error";

interface StoreLogoUploadProps {
  /** Current logo URL from the settings singleton (`null` when unset). */
  logoUrl: string | null;
}

/**
 * Store-logo upload / replace / remove (TASK-299).
 *
 * The logo is deliberately NOT a field of the SEO-settings RHF form: the API
 * keeps it out of `UpdateSeoSettingsDto` and only writes it through the
 * dedicated multipart upload + delete routes, so an admin cannot point
 * `logoUrl` at an arbitrary URL. That also keeps this component free of
 * forms.md's seeding rules — the preview renders straight from the query prop,
 * with no local state to fall out of sync on a refetch.
 *
 * Both mutations invalidate the public settings query, which is what the admin
 * shell's brand mark reads — so the sidebar logo updates without a reload.
 */
export function StoreLogoUpload({ logoUrl }: StoreLogoUploadProps) {
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useAdminSeoSettingsControllerUploadLogo();
  const remove = useAdminSeoSettingsControllerDeleteLogo();

  const invalidateSettings = () =>
    queryClient.invalidateQueries({
      queryKey: getSeoSettingsControllerGetSettingsQueryKey(),
    });

  const handleSelectFile = (file: File) => {
    setUploadError(null);
    upload.mutate(
      { data: { file } },
      {
        onSuccess: () => {
          void invalidateSettings();
          toast.success(dict.storeLogo.toastUploaded);
        },
        // Kept inline (not only a toast) so the reason survives on screen while
        // the admin picks a different file.
        onError: (error) => setUploadError(logoUploadErrorMessage(error)),
      },
    );
  };

  const handleDelete = () => {
    setUploadError(null);
    remove.mutate(undefined, {
      onSuccess: () => {
        void invalidateSettings();
        toast.success(dict.storeLogo.toastDeleted);
      },
      onError: () => toast.error(dict.storeLogo.toastDeleteFailed),
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{dict.storeLogo.heading}</h3>

      <SingleImageUpload
        imageUrl={logoUrl}
        accept={LOGO_ACCEPT}
        labels={{
          alt: dict.storeLogo.alt,
          empty: dict.storeLogo.empty,
          upload: dict.storeLogo.upload,
          replace: dict.storeLogo.replace,
          delete: dict.storeLogo.delete,
          deleteTitle: dict.storeLogo.deleteTitle,
          deleteDescription: dict.storeLogo.deleteDescription,
          cancel: dict.common.cancel,
          confirmDelete: dict.common.delete,
        }}
        hint={dict.storeLogo.hint}
        error={uploadError}
        isUploading={upload.isPending}
        isDeleting={remove.isPending}
        onSelectFile={handleSelectFile}
        onDelete={handleDelete}
      />
    </section>
  );
}
