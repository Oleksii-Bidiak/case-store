"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  formatMediaTags,
  getMediaControllerFindByIdQueryKey,
  isValidMediaTagList,
  mediaUsageKindLabel,
  parseMediaTags,
  useMediaControllerDelete,
  useMediaControllerFindById,
  useMediaControllerUpdate,
  MAX_MEDIA_ALT_LENGTH,
  type MediaAssetResponseEnvelope,
} from "@/entities/media";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { apiErrorStatus } from "@/shared/lib";
import { formatDateTime, formatFileSize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { MediaMetadataField } from "./media-metadata-field";

const t = dict.mediaLibrary;

interface MediaAssetDialogProps {
  /** The asset to show, or `null` when the dialog is closed. */
  assetId: string | null;
  /** Whether this operator holds `media:write`. */
  canWrite: boolean;
  onClose: () => void;
  /** Called after a successful delete, so the grid can drop the card. */
  onDeleted: () => void;
  /** Called after alt/tags were saved, so the grid row catches up. */
  onUpdated: () => void;
}

/**
 * One media asset, in full: the picture, what we know about the file, the
 * editable metadata, every place it is used, and the delete.
 *
 * WHY THE DELETE LIVES HERE AND NOT ON THE GRID CARD. An asset may only be
 * deleted when nothing references it, and "nothing" is computed fresh on every
 * read — the grid row carries only a COUNT. Putting the button next to the full
 * `usedIn[]` means the refusal and its reason are on one screen: an operator who
 * cannot delete sees the three products holding the picture, rather than a toast
 * telling them there are three.
 *
 * The 409 path is not dead code, for the same reason the check is computed
 * rather than stored: the list was true when the dialog opened, and someone else
 * can attach the picture to a banner in the meantime. A refused delete therefore
 * REFETCHES and turns the usage section into the alert — the list the operator
 * now has to act on, never a bare "не вдалося видалити".
 */
export function MediaAssetDialog({
  assetId,
  canWrite,
  onClose,
  onDeleted,
  onUpdated,
}: MediaAssetDialogProps) {
  const queryClient = useQueryClient();

  /**
   * Every transient answer this dialog holds is STAMPED WITH THE ASSET it is
   * about, and read back only while that asset is the one on screen.
   *
   * The obvious shape — three plain flags plus a `useEffect` that clears them
   * whenever `assetId` changes — is a cascading render by construction, and
   * `react-hooks/set-state-in-effect` rejects it. Stamping is not merely a way
   * around the rule: it is what makes the reset impossible to forget. There is
   * no moment, however brief, in which the previous asset's «Збережено» or a
   * half-pressed «Видалити» is shown against the next one.
   */
  const [confirmingDeleteFor, setConfirmingDeleteFor] = useState<string | null>(
    null,
  );
  const [usageConflictFor, setUsageConflictFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{
    assetId: string;
    status: "saving" | "saved" | "error" | "invalid-tags";
  } | null>(null);

  const isConfirmingDelete =
    assetId !== null && confirmingDeleteFor === assetId;
  const hasUsageConflict = assetId !== null && usageConflictFor === assetId;
  const saveStatus = saveState?.assetId === assetId ? saveState.status : null;

  const detail = useMediaControllerFindById(assetId ?? "", {
    query: { enabled: assetId !== null },
  });
  const asset = detail.data?.data;

  const update = useMediaControllerUpdate();
  const remove = useMediaControllerDelete();

  const save = (data: { alt?: string; tags?: string[] }) => {
    if (!assetId) return;
    setSaveState({ assetId, status: "saving" });
    update.mutate(
      { id: assetId, data },
      {
        onSuccess: (response: MediaAssetResponseEnvelope) => {
          // Write the server's own answer into the cache rather than
          // invalidating: a refetch racing the operator's next keystroke is
          // precisely what the field's sync guard then has to survive, and there
          // is no reason to create that race when the response IS the new row.
          queryClient.setQueryData(
            getMediaControllerFindByIdQueryKey(assetId),
            response,
          );
          setSaveState({ assetId, status: "saved" });
          onUpdated();
        },
        onError: () => setSaveState({ assetId, status: "error" }),
      },
    );
  };

  const confirmDelete = () => {
    if (!assetId) return;
    remove.mutate(
      { id: assetId },
      {
        onSuccess: () => {
          toast.success(t.toastDeleted);
          onDeleted();
        },
        onError: (error) => {
          setConfirmingDeleteFor(null);
          if (apiErrorStatus(error) === 409) {
            // Someone attached it between our read and our delete. Pull the
            // usage list that is true NOW, and show that.
            setUsageConflictFor(assetId);
            void detail.refetch();
            return;
          }
          toast.error(t.toastDeleteFailed);
        },
      },
    );
  };

  const usedIn = asset?.usedIn ?? [];
  const isInUse = usedIn.length > 0;
  const fileSize = asset ? formatFileSize(asset.bytes) : null;

  return (
    <Dialog
      open={assetId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.detailTitle}</DialogTitle>
          <DialogDescription>{t.altHint}</DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2
              className="size-6 animate-spin text-primary"
              aria-hidden="true"
            />
          </div>
        ) : detail.isError || !asset ? (
          <p role="alert" className="text-sm text-destructive">
            {t.detailLoadError}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt={asset.alt ?? t.thumbAlt}
                className="max-h-72 w-full object-contain"
              />
            </div>

            {/* The backfill could not read width/height/bytes out of files a
                migration never opened, so 0 means "unknown" — never «0 байт». */}
            <p className="text-xs text-muted-foreground">
              {[
                asset.width > 0 && asset.height > 0
                  ? t.dimensions(asset.width, asset.height)
                  : t.unknownValue,
                fileSize ?? t.unknownValue,
                asset.mime,
                `${t.uploadedAt}: ${formatDateTime(asset.createdAt)}`,
              ].join(" · ")}
            </p>

            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {t.openOriginal}
            </a>

            <MediaMetadataField
              id="media-alt"
              label={t.altLabel}
              hint={t.altHint}
              placeholder={t.altPlaceholder}
              maxLength={MAX_MEDIA_ALT_LENGTH}
              disabled={!canWrite}
              value={asset.alt ?? ""}
              normalise={(raw) => raw.trim()}
              onCommit={(next) => save({ alt: next })}
            />

            <MediaMetadataField
              id="media-tags"
              label={t.tagsLabel}
              hint={t.tagsHint}
              placeholder={t.tagsPlaceholder}
              disabled={!canWrite}
              value={formatMediaTags(asset.tags)}
              normalise={(raw) => formatMediaTags(parseMediaTags(raw))}
              onCommit={(next) => {
                const tags = parseMediaTags(next);
                // Checked here, not by the server: the alt field carries
                // `maxLength` and so cannot be over-long, but a tag list is one
                // string that becomes many values, and no input attribute says
                // "at most twenty of them". Without this the 400 arrives as the
                // generic «Не вдалося зберегти», which does not tell an operator
                // to use fewer tags.
                if (!isValidMediaTagList(tags)) {
                  setSaveState({ assetId: asset.id, status: "invalid-tags" });
                  return;
                }
                save({ tags });
              }}
            />

            <p role="status" className="text-xs text-muted-foreground">
              {saveStatus === "saving"
                ? t.saving
                : saveStatus === "saved"
                  ? t.saved
                  : ""}
            </p>
            {(saveStatus === "error" || saveStatus === "invalid-tags") && (
              <p role="alert" className="text-sm text-destructive">
                {saveStatus === "invalid-tags" ? t.tagsInvalid : t.saveError}
              </p>
            )}

            <section
              aria-labelledby="media-usage-heading"
              className={cn(
                "rounded-lg border p-3",
                hasUsageConflict
                  ? "border-destructive bg-destructive/5"
                  : "border-border",
              )}
            >
              <h3
                id="media-usage-heading"
                className={cn(
                  "text-sm font-semibold",
                  hasUsageConflict && "text-destructive",
                )}
              >
                {hasUsageConflict ? t.conflictHeading : t.usageHeading}
              </h3>
              {hasUsageConflict && (
                <p role="alert" className="mt-1 text-sm text-destructive">
                  {t.conflictHint}
                </p>
              )}
              {isInUse ? (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {usedIn.map((usage) => (
                    <li key={`${usage.kind}-${usage.entityId}`}>
                      {t.usageRow(mediaUsageKindLabel(usage.kind), usage.label)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.usageEmpty}
                </p>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && asset ? (
              isConfirmingDelete ? (
                <>
                  <span className="text-sm font-medium">
                    {t.deleteConfirmQuestion}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={confirmDelete}
                  >
                    {remove.isPending && <Loader2 className="animate-spin" />}
                    {t.deleteConfirm}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDeleteFor(null)}
                  >
                    {dict.common.cancel}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isInUse}
                    onClick={() => setConfirmingDeleteFor(assetId)}
                  >
                    <Trash2 className={isInUse ? "" : "text-destructive"} />
                    {t.delete}
                  </Button>
                  {isInUse && (
                    <span className="text-xs text-muted-foreground">
                      {t.deleteBlocked}
                    </span>
                  )}
                </>
              )
            ) : null}
          </div>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
