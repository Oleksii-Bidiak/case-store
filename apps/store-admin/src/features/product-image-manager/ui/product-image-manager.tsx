"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";
import {
  getProductImageControllerListQueryKey,
  useProductImageControllerDelete,
  useProductImageControllerList,
  useProductImageControllerReorder,
  useProductImageControllerUpload,
  type ProductImageEntity,
} from "@/entities/product";
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

interface ProductImageManagerProps {
  productId: string;
}

/**
 * Admin product-image manager: lists a product's images and lets an admin
 * upload new ones, reorder them, set the primary (cover) image, and delete them.
 * Reordering uses move buttons (accessible, no DnD library); `next/image`
 * optimization is deferred to TASK-074.
 */
export function ProductImageManager({ productId }: ProductImageManagerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const listQueryKey = getProductImageControllerListQueryKey(productId);
  const { data, isLoading, isError } = useProductImageControllerList(productId);
  const images = [...(data?.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listQueryKey });

  const upload = useProductImageControllerUpload();
  const reorder = useProductImageControllerReorder();
  const remove = useProductImageControllerDelete();
  const busy = upload.isPending || reorder.isPending || remove.isPending;

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    upload.mutate(
      { productId, data: { files: Array.from(fileList) } },
      {
        onSuccess: () => {
          void invalidate();
          toast.success("Images uploaded");
        },
        onError: () => toast.error("Upload failed — check file type and size"),
        onSettled: () => {
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
      },
    );
  };

  /** Persist a full ordering + primary flag for the current image set. */
  const persistOrder = (ordered: ProductImageEntity[], primaryId: string) => {
    reorder.mutate(
      {
        productId,
        data: {
          items: ordered.map((img, index) => ({
            id: img.id,
            sortOrder: index,
            isPrimary: img.id === primaryId,
          })),
        },
      },
      {
        onSuccess: () => void invalidate(),
        onError: () => toast.error("Failed to reorder images"),
      },
    );
  };

  const currentPrimaryId =
    images.find((img) => img.isPrimary)?.id ?? images[0]?.id ?? "";

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next, currentPrimaryId);
  };

  const setPrimary = (id: string) => persistOrder(images, id);

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    remove.mutate(
      { productId, imageId: pendingDeleteId },
      {
        onSuccess: () => {
          void invalidate();
          toast.success("Image deleted");
        },
        onError: () => toast.error("Failed to delete image"),
        onSettled: () => setPendingDeleteId(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {upload.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ImagePlus />
          )}
          Upload images
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-sm text-muted-foreground">
          JPEG, PNG, WebP or GIF — up to 5 MB each.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          Failed to load images. Please try again.
        </p>
      ) : images.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No images yet. Upload the first one to set the product cover.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="aspect-square w-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt ?? "Product image"}
                  className="h-full w-full object-cover"
                />
              </div>

              {image.isPrimary && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                  <Star className="size-3 fill-current" /> Primary
                </span>
              )}

              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move left"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move right"
                    disabled={busy || index === images.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRight />
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Set as primary"
                    disabled={busy || image.isPrimary}
                    onClick={() => setPrimary(image.id)}
                  >
                    <Star className={image.isPrimary ? "fill-current" : ""} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete image"
                    disabled={busy}
                    onClick={() => setPendingDeleteId(image.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete image?</DialogTitle>
            <DialogDescription>
              This permanently removes the image from the product and storage.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={confirmDelete}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
