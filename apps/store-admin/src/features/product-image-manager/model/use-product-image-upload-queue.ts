"use client";

import { useProductImageControllerUpload } from "@/entities/product";
import { imageUploadErrorMessage } from "@/shared/lib/image-upload-error";
import { useImageUploadQueue } from "@/shared/lib/use-image-upload-queue";
import { dict } from "@/shared/config";

/**
 * The shared upload queue, wired to the PRODUCT gallery endpoint.
 *
 * The queue itself moved to `shared/lib/use-image-upload-queue` in TASK-441,
 * when the media library became its third caller — read its docblock before
 * touching ordering, concurrency or the `isUploading` latch. What is left here
 * is the product-specific half: which endpoint one file goes to, and whose
 * dictionary explains a refusal.
 *
 * It is a named hook rather than two inline options because BOTH callers
 * — this panel and `CreateProductView`'s replay — must send photos exactly the
 * same way. Two copies of the wiring is how the create flow would end up posting
 * to the gallery with, say, its own error copy, and nobody would notice until an
 * operator saw two different words for the same 413.
 *
 * The product id stays an argument to `enqueue`/`retry`: the create flow only
 * learns it from the `POST /products` response.
 */
export function useProductImageUploadQueue() {
  const upload = useProductImageControllerUpload();

  return useImageUploadQueue<string>({
    send: (file, productId) =>
      upload.mutateAsync({ productId, data: { files: [file] } }),
    describeError: (error) =>
      imageUploadErrorMessage(error, dict.productImages),
  });
}
