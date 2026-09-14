// Media entity (TASK-441) — the internal media library.
// Re-exports the Orval-generated media client from the shared layer so widgets
// depend on `@/entities/media` rather than reaching into `@/shared/api`.

export {
  useMediaControllerFindAll,
  useMediaControllerFindById,
  useMediaControllerUpload,
  useMediaControllerUpdate,
  useMediaControllerDelete,
  getMediaControllerFindAllQueryKey,
  getMediaControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  MediaAssetEntity,
  MediaAssetDetailEntity,
  MediaAssetResponseEnvelope,
  MediaListResponseEnvelope,
  MediaMetadataDto,
  MediaUsageEntity,
  MediaControllerFindAllParams,
} from "@/shared/api";

export { MediaUsageEntityKind } from "@/shared/api";

export {
  MAX_MEDIA_ALT_LENGTH,
  MAX_MEDIA_TAGS,
  MAX_MEDIA_TAG_LENGTH,
  mediaUsageKindLabel,
  parseMediaTags,
  formatMediaTags,
  isValidMediaTagList,
} from "./model/media-metadata";
