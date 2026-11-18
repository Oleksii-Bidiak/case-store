"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getSeoSettingsControllerGetSettingsQueryKey,
  useAdminSeoSettingsControllerDeleteLogo,
  useAdminSeoSettingsControllerSetLogoFromLibrary,
  useAdminSeoSettingsControllerUploadLogo,
} from "@/entities/seo-settings";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { MediaPicker } from "@/features/media-picker";
import { SingleImageUpload } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  LOGO_ACCEPT,
  logoPickErrorMessage,
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
 * All mutations invalidate the public settings query, which is what the admin
 * shell's brand mark reads — so the sidebar logo updates without a reload.
 *
 * The logo is a media-library asset since TASK-2041: an upload lands in the
 * library, and «З медіатеки» (shown with `media:read`) sends only the chosen
 * asset's id to `PUT /admin/seo-settings/logo` — the URL is still never typed.
 */
export function StoreLogoUpload({ logoUrl }: StoreLogoUploadProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useAdminSeoSettingsControllerUploadLogo();
  const remove = useAdminSeoSettingsControllerDeleteLogo();
  const setFromLibrary = useAdminSeoSettingsControllerSetLogoFromLibrary();

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

  const handlePick = (mediaAssetId: string) => {
    setUploadError(null);
    setFromLibrary.mutate(
      { data: { mediaAssetId } },
      {
        onSuccess: () => {
          void invalidateSettings();
          toast.success(dict.storeLogo.toastUploaded);
        },
        onError: (error) => setUploadError(logoPickErrorMessage(error)),
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
    // A sub-block of «Магазин і логотип» on /settings/seo since TASK-1053, so
    // its heading is one level below that card's.
    <section className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">{dict.storeLogo.heading}</h4>

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
        isUploading={upload.isPending || setFromLibrary.isPending}
        isDeleting={remove.isPending}
        onSelectFile={handleSelectFile}
        onDelete={handleDelete}
        actions={
          can(PERM.mediaRead) ? (
            <MediaPicker
              ariaLabel={dict.storeLogo.pickerAria}
              disabled={upload.isPending || setFromLibrary.isPending}
              onPick={(asset) => handlePick(asset.id)}
            />
          ) : undefined
        }
      />
    </section>
  );
}
