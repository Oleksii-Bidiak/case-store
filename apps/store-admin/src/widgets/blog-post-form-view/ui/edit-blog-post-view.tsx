"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { StarIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  BlogPostForm,
  blogPostFormValuesToUpdateDto,
  type BlogPostFormInput,
  type BlogPostFormValues,
} from "@/features/blog-post-form";
import { SitePreviewButton } from "@/features/site-preview";
import {
  getAdminBlogControllerFindAllQueryKey,
  getAdminBlogControllerFindByIdQueryKey,
  useAdminBlogControllerFindById,
  useAdminBlogControllerUpdate,
  type BlogPostEntity,
} from "@/entities/blog";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { formatKeywords } from "@/shared/lib/seo";
import type { FormSubmitController } from "@/shared/lib/form-submit-controller";
import { AdminFormSkeleton, Badge, useConfirmDialog } from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDate, formatDateTime, toKyivDateTimeLocal } from "@/shared/lib";
import { BlogPostReadOnly } from "./blog-post-read-only";

const d = dict.blogPosts;

interface EditBlogPostViewProps {
  postId: string;
}

/**
 * Edit-post page (BlogProposal БЛ7–БЛ8, wave 198).
 *
 * Header: «← Блог», the post's own title, its status (and «★ Головна» / «Не в
 * списках»), the category, the byline and the public address, and «Відкрити
 * на сайті» — for a PUBLISHED post, in a new tab (owner decision 2026-10-01) —
 * or «Подивитись на сайті», a signed preview link, for a draft or scheduled one
 * (TASK-670). Body: the sectioned form with one sticky «Зберегти».
 *
 * A missing post (404) redirects back to the list.
 */
export function EditBlogPostView({ postId }: EditBlogPostViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();
  // TASK-667: `blog:read` alone opens the same page as the read-only template.
  const { can, arePermissionsLoading } = useAuth();
  const canWrite = can(PERM.blogWrite);

  const { data, isLoading, isError, error } =
    useAdminBlogControllerFindById(postId);
  const update = useAdminBlogControllerUpdate();
  const formRef = useRef<FormSubmitController>(null);
  // TASK-670: «Зберегти й подивитись» saves and STAYS — the preview popover is
  // waiting on this page for the save to land.
  const stayAfterSaveRef = useRef(false);

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/blog");
    }
  }, [isNotFound, router]);

  const post = data?.data;

  const handleSubmit = async (values: BlogPostFormValues): Promise<boolean> => {
    // TASK-285: renaming a PUBLISHED post's slug kills its indexed URL — warn
    // first (an AlertDialog since TASK-812). A blank slug means "auto-generate"
    // (treated as no rename here).
    const nextSlug = values.slug?.trim();
    const wasLive = post?.status === "PUBLISHED";
    if (wasLive && post && nextSlug && nextSlug !== post.slug) {
      const confirmed = await confirm({
        title: d.slugChangeTitle,
        description: d.slugChangeConfirm(post.slug, nextSlug),
        confirmLabel: d.slugChangeAction,
      });
      if (!confirmed) return false;
    }
    try {
      await update.mutateAsync({
        id: postId,
        data: blogPostFormValuesToUpdateDto(values),
      });
    } catch {
      toast.error(d.toastUpdateFailed);
      return false;
    }
    void queryClient.invalidateQueries({
      queryKey: getAdminBlogControllerFindAllQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminBlogControllerFindByIdQueryKey(postId),
    });
    toast.success(d.toastUpdated);
    if (!stayAfterSaveRef.current) router.push("/blog");
    return true;
  };

  const saveForPreview = async () => {
    stayAfterSaveRef.current = true;
    try {
      return (await formRef.current?.submit()) ?? false;
    } finally {
      stayAfterSaveRef.current = false;
    }
  };

  const liveHref =
    post?.status === "PUBLISHED" ? `${STOREFRONT_URL}/blog/${post.slug}` : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link
            href="/blog"
            className="w-fit text-sm text-muted-foreground hover:text-foreground"
          >
            {d.back}
          </Link>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {post?.title ?? d.editHeading}
          </h2>
          {post ? <PostFacts post={post} /> : null}
        </div>
        {post ? (
          <SitePreviewButton
            target={{ type: "post", id: postId }}
            liveHref={liveHref}
            description={
              post.status === "SCHEDULED" && post.scheduledAt
                ? dict.sitePreview.whatPostScheduled(
                    formatDateTime(post.scheduledAt),
                  )
                : dict.sitePreview.whatPost
            }
            hasUnsavedChanges={() => formRef.current?.isDirty() ?? false}
            onSave={canWrite ? saveForPreview : undefined}
          />
        ) : null}
      </div>

      {isLoading || arePermissionsLoading ? (
        <AdminFormSkeleton />
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadOneError}
        </p>
      ) : post && !canWrite ? (
        <BlogPostReadOnly post={post} />
      ) : post ? (
        <BlogPostForm
          id={postId}
          controllerRef={formRef}
          defaultValues={mapPostToFormValues(post)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

/** The status line under the title: badges, then «Категорія · автор · /blog/…». */
function PostFacts({ post }: { post: BlogPostEntity }) {
  const status =
    post.status === "SCHEDULED"
      ? post.scheduledAt
        ? d.statusScheduledOn(formatDate(post.scheduledAt))
        : d.statusScheduled
      : post.status === "PUBLISHED"
        ? d.statusPublished
        : d.statusDraft;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Badge
        variant={
          post.status === "PUBLISHED"
            ? "default"
            : post.status === "SCHEDULED"
              ? "outline"
              : "secondary"
        }
      >
        {status}
      </Badge>
      {post.featured ? (
        <Badge variant="outline">
          <StarIcon aria-hidden="true" />
          {d.featuredBadge}
        </Badge>
      ) : null}
      {post.listed ? null : (
        <Badge variant="secondary">{d.unlistedBadge}</Badge>
      )}
      <span>
        {[post.category.name, post.authorName, `/blog/${post.slug}`]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
  );
}

/** Map a fetched post entity onto the form's string-based input shape. */
function mapPostToFormValues(post: BlogPostEntity): Partial<BlogPostFormInput> {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    categoryId: post.category.id,
    authorName: post.authorName,
    coverImageUrl: post.coverImageUrl ?? "",
    readingMinutes:
      post.readingMinutes != null ? String(post.readingMinutes) : "",
    featured: post.featured,
    listed: post.listed,
    metaTitle: post.metaTitle ?? "",
    metaDescription: post.metaDescription ?? "",
    keywords: formatKeywords(post.keywords),
    ogImage: post.ogImage ?? "",
    status: post.status,
    // Seeded in KYIV time, like every rendered date in the admin panel. The
    // local `toDateTimeLocal` this replaces used the BROWSER's zone, so on any
    // machine outside Kyiv this field and the post list disagreed about when the
    // post goes live — by hours, and across midnight by a whole day. See
    // `shared/lib/format/datetime-local.ts`.
    scheduledAt: post.scheduledAt ? toKyivDateTimeLocal(post.scheduledAt) : "",
  };
}
