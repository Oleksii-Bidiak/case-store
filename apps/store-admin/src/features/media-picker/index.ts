/**
 * The media library, as a reusable piece (TASK-441).
 *
 * WHY THE LIBRARY UI LIVES IN A SLICE CALLED `media-picker`. The picker has to
 * be a feature — it is dropped into six forms, and a form may not import a
 * widget. But the picker's grid, card, upload zone and detail dialog are the
 * SAME ones the `/media` screen shows, and a second copy of a grid is how two
 * screens drift apart one prop at a time. So they moved down here with it, and
 * `widgets/media-library-view` became a thin composition over this slice rather
 * than the owner of the parts.
 */
export { MediaPicker, type MediaPickerProps } from "./ui/media-picker";
export {
  MediaPickerEditorButton,
  type MediaPickerEditorButtonProps,
} from "./ui/media-picker-editor-button";
export {
  MediaAssetGrid,
  type MediaAssetGridProps,
} from "./ui/media-asset-grid";
export { MediaAssetDialog } from "./ui/media-asset-dialog";
export { MediaUploadZone } from "./ui/media-upload-zone";
export { MediaLibrarySkeleton } from "./ui/media-library-skeleton";
// Wave 198 (МТ1–МТ12): the upload queue as a hook, so the /media screen can lay
// it out as tiles in its grid while the picker keeps its drop zone.
export {
  useMediaUploads,
  type MediaUploads,
  type MediaUploadsOptions,
} from "./model/use-media-uploads";
export { MediaPendingTile } from "./ui/media-pending-tile";
export { MediaUploadSummary } from "./ui/media-upload-summary";
