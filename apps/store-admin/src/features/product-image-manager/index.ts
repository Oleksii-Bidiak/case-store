export { ProductImageManager } from "./ui/product-image-manager";
// TASK-442: the create flow replays staged photos through the SAME queue this
// panel uploads with — one request per file, one drain loop at a time.
export {
  useImageUploadQueue,
  type UploadDrainSummary,
  type UploadQueueItem,
  type UploadQueueStatus,
} from "./model/use-image-upload-queue";
