/**
 * The four content-image upload hooks (TASK-424).
 *
 * Re-exported here so that exactly ONE file in the app names the generated
 * module: `@/shared/api`'s barrel does not yet list `generated/uploads` (adding
 * that line was outside this change's file scope), and four forms each reaching
 * into `generated/` would be four places to fix when it is added. Swapping these
 * re-exports to `@/shared/api` later is a one-line change here and nowhere else.
 */
export {
  useUploadsControllerUploadCategoryImage,
  useUploadsControllerUploadBrandLogo,
  useUploadsControllerUploadBannerImage,
  useUploadsControllerUploadBlogCover,
} from "@/shared/api/generated/uploads/uploads";
