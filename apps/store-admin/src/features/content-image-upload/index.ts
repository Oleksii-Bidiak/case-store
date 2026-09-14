// Shared image field for the content forms (TASK-424): upload a file, or paste
// a link. Consumed by category-form, brand-form, banner-form and blog-post-form.
export { ContentImageField } from "./ui/content-image-field";
export type { ContentImageFieldProps } from "./ui/content-image-field";
// TASK-441 moved the accepted-extension list and the 413/415 → copy mapping to
// `@/shared/lib/image-upload-error`: the product gallery and the media library
// need them too, and feature → feature is not an import direction FSD allows.
// Re-exported here only because `ContentImageFieldProps` is typed in terms of
// `ImageUploadCopy`; new callers should import from `shared/lib` directly.
export {
  CONTENT_IMAGE_ACCEPT,
  imageUploadErrorMessage,
  type ImageUploadCopy,
} from "@/shared/lib/image-upload-error";
export {
  useImageUploadField,
  type ImageUploadFieldState,
  type ImageUploadMutation,
} from "./model/use-image-upload-field";
export {
  useUploadsControllerUploadCategoryImage,
  useUploadsControllerUploadBrandLogo,
  useUploadsControllerUploadBannerImage,
  useUploadsControllerUploadBlogCover,
} from "./model/upload-hooks";
