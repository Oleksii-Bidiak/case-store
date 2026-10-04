"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import {
  getMediaControllerFindByIdQueryKey,
  mediaUsageKindLabel,
  useMediaControllerDelete,
  useMediaControllerFindById,
  useMediaControllerUpdate,
  MAX_MEDIA_ALT_LENGTH,
  type MediaAssetDetailEntity,
  type MediaAssetResponseEnvelope,
} from "@/entities/media";
import { useAuth } from "@/entities/session";
import {
  Button,
  CopyButton,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { apiErrorStatus } from "@/shared/lib";
import { formatDateTime, formatFileSize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { isImportedAsset, mediaFormatName } from "../model/media-asset-meta";
import { mediaUsageLink } from "../model/media-usage-links";
import { MediaMetadataField } from "./media-metadata-field";
import { MediaTagsField } from "./media-tags-field";

const t = dict.mediaLibrary;

type SaveField = "alt" | "tags";

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
 * ── Layout (wave 198, МТ5–МТ9) ─────────────────────────────────────────────
 * Two columns — the picture and its facts on the left, the fields on the right
 * — so the alt text is written LOOKING at the picture rather than after
 * scrolling past it. Below `md` the dialog takes the whole screen (МТ7) and
 * the columns stack; the footer stays one row.
 *
 * WHY THE DELETE LIVES HERE AND NOT ON THE GRID CARD. An asset may only be
 * deleted when nothing references it, and "nothing" is computed fresh on every
 * read — the grid row carries only a COUNT. Putting the button next to the full
 * `usedIn[]` means the refusal and its reason are on one screen.
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
   * The obvious shape — plain flags plus a `useEffect` that clears them
   * whenever `assetId` changes — is a cascading render by construction, and
   * `react-hooks/set-state-in-effect` rejects it. Stamping is not merely a way
   * around the rule: it is what makes the reset impossible to forget.
   */
  const [confirmingDeleteFor, setConfirmingDeleteFor] = useState<string | null>(
    null,
  );
  const [usageConflictFor, setUsageConflictFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{
    assetId: string;
    field: SaveField;
    status: "saving" | "saved" | "error" | "invalid-tags";
  } | null>(null);

  const isConfirmingDelete =
    assetId !== null && confirmingDeleteFor === assetId;
  const hasUsageConflict = assetId !== null && usageConflictFor === assetId;
  const save = saveState?.assetId === assetId ? saveState : null;

  const detail = useMediaControllerFindById(assetId ?? "", {
    query: { enabled: assetId !== null },
  });
  const asset = detail.data?.data;

  const update = useMediaControllerUpdate();
  const remove = useMediaControllerDelete();

  const persist = (
    field: SaveField,
    data: { alt?: string; tags?: string[] },
  ) => {
    if (!assetId) return;
    setSaveState({ assetId, field, status: "saving" });
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
          setSaveState({ assetId, field, status: "saved" });
          onUpdated();
        },
        onError: () => setSaveState({ assetId, field, status: "error" }),
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

  /** «Збережено ✓» / «Збереження…» next to the label of the field it is about. */
  const statusFor = (field: SaveField) => (
    <span
      role="status"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
    >
      {save?.field === field && save.status === "saving" && (
        <>
          <Loader2
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t.saving}
        </>
      )}
      {save?.field === field && save.status === "saved" && (
        <>
          {/* Green on the tick only: as text, the success token is ~3:1. */}
          <Check className="size-3.5 text-success" aria-hidden="true" />
          {t.saved}
        </>
      )}
    </span>
  );

  const usedIn = asset?.usedIn ?? [];
  const isInUse = usedIn.length > 0;

  return (
    <Dialog
      open={assetId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "flex max-h-screen flex-col gap-0 p-0 sm:max-w-4xl",
          // МТ7: the whole phone screen, edge to edge.
          "max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:rounded-none max-md:border-0",
        )}
      >
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle>{t.detailTitle}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {detail.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2
                className="size-6 animate-spin text-primary motion-reduce:animate-none"
                aria-hidden="true"
              />
            </div>
          ) : detail.isError || !asset ? (
            <p role="alert" className="text-sm text-destructive">
              {t.detailLoadError}
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <MediaAssetFacts asset={asset} />

              <div className="flex flex-col gap-5">
                <MediaMetadataField
                  id="media-alt"
                  label={t.altLabel}
                  hint={t.altHint}
                  placeholder={t.altPlaceholder}
                  maxLength={MAX_MEDIA_ALT_LENGTH}
                  disabled={!canWrite}
                  value={asset.alt ?? ""}
                  normalise={(raw) => raw.trim()}
                  onCommit={(next) => persist("alt", { alt: next })}
                  status={statusFor("alt")}
                />

                <MediaTagsField
                  id="media-tags"
                  disabled={!canWrite}
                  value={asset.tags}
                  onCommit={(tags) => persist("tags", { tags })}
                  onInvalid={() =>
                    setSaveState({
                      assetId: asset.id,
                      field: "tags",
                      status: "invalid-tags",
                    })
                  }
                  status={statusFor("tags")}
                />

                {(save?.status === "error" ||
                  save?.status === "invalid-tags") && (
                  <p role="alert" className="text-sm text-destructive">
                    {save.status === "invalid-tags"
                      ? t.tagsInvalid
                      : t.saveError}
                  </p>
                )}

                <MediaUsageSection
                  usedIn={usedIn}
                  hasConflict={hasUsageConflict}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-5 py-3 sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {canWrite && asset ? (
              isConfirmingDelete ? (
                <>
                  <span className="text-sm font-semibold">
                    {t.deleteConfirmQuestion}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={confirmDelete}
                  >
                    {remove.isPending && (
                      <Loader2 className="animate-spin motion-reduce:animate-none" />
                    )}
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
                  {/* МТ6: no outline either way — a bordered button that
                      cannot be pressed still reads as an invitation. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isInUse}
                    aria-describedby={
                      isInUse ? "media-delete-blocked" : undefined
                    }
                    className={cn(
                      !isInUse &&
                        "text-destructive hover:bg-destructive/10 hover:text-destructive",
                    )}
                    onClick={() => setConfirmingDeleteFor(assetId)}
                  >
                    <Trash2 />
                    {t.delete}
                  </Button>
                  {isInUse && (
                    <span
                      id="media-delete-blocked"
                      className="max-w-xs text-xs text-muted-foreground"
                    >
                      {t.deleteBlocked(usedIn.length)}
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

/** The left column: the picture, what is known about the file, two actions. */
function MediaAssetFacts({ asset }: { asset: MediaAssetDetailEntity }) {
  const imported = isImportedAsset(asset);
  const size = formatFileSize(asset.bytes);
  const measured = asset.width > 0 && asset.height > 0;

  const dimensions = measured
    ? [t.dimensions(asset.width, asset.height), size]
        .filter(Boolean)
        .join(" · ")
    : imported
      ? t.notMeasured
      : (size ?? t.unknownValue);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.alt ?? t.thumbAlt}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <dl className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
        {imported && (
          <>
            <dt className="text-muted-foreground">{t.fileLabel}</dt>
            <dd className="col-span-2 break-words">{t.importedSource}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t.dimensionsLabel}</dt>
        <dd className="col-span-2 break-words">{dimensions}</dd>
        <dt className="text-muted-foreground">{t.formatLabel}</dt>
        <dd className="col-span-2 break-words">
          {mediaFormatName(asset.mime)}
        </dd>
        <dt className="text-muted-foreground">{t.uploadedAt}</dt>
        <dd className="col-span-2 break-words">
          {formatDateTime(asset.createdAt)}
        </dd>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={asset.url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" />
            {t.openOriginal}
          </a>
        </Button>
        <CopyButton
          value={asset.url}
          label={t.copyLink}
          copiedLabel={t.copyLinkDone}
          failedLabel={t.copyLinkFailed}
        />
      </div>
    </div>
  );
}

/** «Де використовується», with a «Відкрити →» per row the operator may open. */
function MediaUsageSection({
  usedIn,
  hasConflict,
}: {
  usedIn: MediaAssetDetailEntity["usedIn"];
  hasConflict: boolean;
}) {
  const { can } = useAuth();

  return (
    <section
      aria-labelledby="media-usage-heading"
      className={cn(
        "rounded-lg border p-4",
        hasConflict ? "border-destructive bg-destructive/5" : "border-border",
      )}
    >
      <h3 id="media-usage-heading" className="text-sm font-semibold">
        {hasConflict ? t.conflictHeading : t.usageHeading}
      </h3>
      {hasConflict && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {t.conflictHint}
        </p>
      )}
      {usedIn.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {usedIn.map((usage) => {
            const kind = mediaUsageKindLabel(usage.kind);
            const link = mediaUsageLink(usage.kind, usage.entityId);
            return (
              <li
                key={`${usage.kind}-${usage.entityId}`}
                className="flex items-start justify-between gap-3"
              >
                <span className="min-w-0">{t.usageRow(kind, usage.label)}</span>
                {link && can(link.permission) && (
                  <Link
                    href={link.href}
                    aria-label={t.usageOpenAria(kind, usage.label)}
                    className="shrink-0 rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t.usageOpen}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t.usageEmpty}</p>
      )}
    </section>
  );
}
