export { ProductImageManager } from "./ui/product-image-manager";
// TASK-442: the create flow replays staged photos through the SAME queue this
// panel uploads with — one request per file, one drain loop at a time.
//
// TASK-441 moved the queue MECHANICS down to
// `shared/lib/use-image-upload-queue` (the media library is its third caller,
// and feature → feature is not an import direction FSD allows). What this
// feature still owns, and exports here, is the product wiring: the gallery
// endpoint plus the product dictionary. Queue types come from the shared module.
export { useProductImageUploadQueue } from "./model/use-product-image-upload-queue";
