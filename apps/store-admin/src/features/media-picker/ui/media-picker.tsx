"use client";

import { useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import {
  getMediaControllerFindAllQueryKey,
  type MediaAssetEntity,
} from "@/entities/media";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  LiveAnnouncer,
  TableSearch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { MediaAssetGrid } from "./media-asset-grid";
import { MediaUploadZone } from "./media-upload-zone";

const t = dict.mediaPicker;

/** Page size inside the dialog — a grid about four rows tall on a laptop. */
const PICKER_PAGE_SIZE = 20;

export interface MediaPickerProps {
  /**
   * Receives the asset the operator chose, or each asset they just uploaded.
   *
   * What "receiving" means is the caller's business: five of the six call sites
   * write `asset.url` into a form field, and the sixth (the product gallery)
   * posts the asset id to `POST /products/:id/images/attach`.
   */
  onPick: (asset: MediaAssetEntity) => void;
  disabled?: boolean;
  /**
   * The trigger element, rendered through `DialogTrigger asChild`. Defaults to
   * an outline button labelled «З медіатеки»; the rich-text editor passes its
   * own so the control matches the toolbar it sits in.
   */
  children?: ReactElement;
}

/**
 * «Обрати з медіатеки / Завантажити» — one control, wired into every image
 * field in the admin (TASK-441, step e).
 *
 * ── Why one component and not six ──────────────────────────────────────────
 * Before this, each image field could only upload INTO ITSELF: the same
 * photograph needed re-uploading for a product, a category tile, a banner and
 * an article, and the library screen could show four identical files with no
 * way to tell they were the same picture. This is the other half of the media
 * library — the half that makes the first one worth having.
 *
 * ── The two tabs are the two permissions ───────────────────────────────────
 * `media:read` gates browsing, `media:write` gates uploading, and each tab is
 * rendered only if its key is held. Holding neither renders NOTHING AT ALL —
 * and that is the important case: every call site keeps its own direct-upload
 * control, so a content manager without the media keys goes on working exactly
 * as they did before instead of meeting a picker that answers 403. A single
 * available tab drops the tab strip too; one tab to choose between is furniture.
 *
 * ── Uploading here uploads into the LIBRARY ────────────────────────────────
 * Not into the field. `POST /api/admin/media` makes a real asset with an id,
 * alt text and usage tracking, which is then handed to `onPick` like any
 * other — so a file that arrives through a banner form is available to a
 * product tomorrow, and deleting it later is refused while the banner shows it.
 * Every asset in a batch is reported, so dropping three photos into a product
 * gallery attaches three; a single-value field simply keeps the last.
 *
 * ── Closing ────────────────────────────────────────────────────────────────
 * A pick from the grid closes immediately — the choice is made. An upload
 * closes only when the whole batch succeeded: a batch with a failure in it
 * keeps the dialog open, because the per-file reason exists nowhere else.
 *
 * ── Keyboard ───────────────────────────────────────────────────────────────
 * Nothing here needs a mouse. The trigger is a button, the dialog traps focus,
 * the tabs are a Radix tablist (arrow keys), every tile is a single `<button>`
 * — one tab stop per asset — and the pager is two buttons. Dragging files in is
 * an addition on the upload tab, never the only way: the picker button inside
 * the drop zone remains the accessible path.
 */
export function MediaPicker({ onPick, disabled, children }: MediaPickerProps) {
  const { can } = useAuth();
  const canRead = can(PERM.mediaRead);
  const canWrite = can(PERM.mediaWrite);

  const [open, setOpen] = useState(false);

  if (!canRead && !canWrite) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (disabled && next) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" variant="outline" disabled={disabled}>
            <ImageIcon />
            {t.trigger}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        {/*
          Mounted only while open, so each visit starts on a clean search and
          page 1 — and so the library query does not run on a form that never
          opens the picker. The upload queue inside is discarded with it, which
          is correct: a settled batch has nothing left to retry.
        */}
        {open && (
          <MediaPickerBody
            canRead={canRead}
            canWrite={canWrite}
            onPick={onPick}
            onClose={() => setOpen(false)}
          />
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {dict.common.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MediaPickerBodyProps {
  canRead: boolean;
  canWrite: boolean;
  onPick: (asset: MediaAssetEntity) => void;
  onClose: () => void;
}

/**
 * The dialog's contents.
 *
 * `LiveAnnouncer` wraps rather than sits inside: the upload zone calls
 * `useAnnouncer()`, and a hook called in the same component that renders the
 * provider reads the default no-op context.
 */
function MediaPickerBody(props: MediaPickerBodyProps) {
  return (
    <LiveAnnouncer>
      <MediaPickerTabs {...props} />
    </LiveAnnouncer>
  );
}

function MediaPickerTabs({
  canRead,
  canWrite,
  onPick,
  onClose,
}: MediaPickerBodyProps) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState(canRead ? "browse" : "upload");

  const pick = (asset: MediaAssetEntity) => {
    onPick(asset);
    onClose();
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-3">
      {/* One tab is not a choice — the strip only earns its space with two. */}
      {canRead && canWrite && (
        <TabsList>
          <TabsTrigger value="browse">{t.tabBrowse}</TabsTrigger>
          <TabsTrigger value="upload">{t.tabUpload}</TabsTrigger>
        </TabsList>
      )}

      {canRead && (
        <TabsContent value="browse" className="flex flex-col gap-3">
          <TableSearch
            mode="local"
            id="media-picker-search"
            value={search}
            label={t.searchLabel}
            placeholder={dict.mediaLibrary.searchPlaceholder}
            onChange={(next) => {
              // A narrowed library has different pages; staying on page 4 of the
              // old result would show a page that no longer exists.
              setSearch(next ?? "");
              setPage(1);
            }}
          />

          <MediaAssetGrid
            search={search}
            page={page}
            pageSize={PICKER_PAGE_SIZE}
            onOpen={pick}
            cardLabel={t.pickCardAria}
            footer={(totalPages) =>
              totalPages > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t.prevPage}
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    {dict.common.previous}
                  </Button>
                  <span role="status" className="text-sm text-muted-foreground">
                    {dict.common.pageOf(page, totalPages)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t.nextPage}
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    {dict.common.next}
                  </Button>
                </div>
              )
            }
          />
        </TabsContent>
      )}

      {canWrite && (
        <TabsContent value="upload">
          <MediaUploadZone
            onAssetUploaded={onPick}
            onBatchSettled={async (summary) => {
              // The new files belong at the top of the browse tab, and a delete
              // or an upload shifts every page — so the whole list key goes,
              // not just the page on screen.
              await queryClient.invalidateQueries({
                queryKey: getMediaControllerFindAllQueryKey(),
              });
              // Anything less than a clean run stays on screen: the failed rows
              // and their reasons live in this queue and nowhere else.
              if (summary.failed === 0 && summary.done > 0) onClose();
            }}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
