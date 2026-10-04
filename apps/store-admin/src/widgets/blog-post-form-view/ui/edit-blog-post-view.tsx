"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, StarIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  BlogPostForm,
  blogPostFormValuesToUpdateDto,
  type BlogPostFormInput,
  type BlogPostFormValues,
} from "@/features/blog-post-form";
import {
  getAdminBlogControllerFindAllQueryKey,
  getAdminBlogControllerFindByIdQueryKey,
  useAdminBlogControllerFindById,
  useAdminBlogControllerUpdate,
  type BlogPostEntity,
} from "@/entities/blog";
import { formatKeywords } from "@/shared/lib/seo";
import {
  AdminFormSkeleton,
  Badge,
  Button,
  useConfirmDialog,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDate, toKyivDateTimeLocal } from "@/shared/lib";

const d = dict.blogPosts;

interface EditBlogPostViewProps {
  postId: string;
}

/**
 * Edit-post page (BlogProposal БЛ7–БЛ8, wave 198).
 *
 * Header: «← Блог», the post's own title, its status (and «★ Головна» / «Не в
 * списках»), the category, the byline and the public address, and «Відкрити
 * на сайті» — for a PUBLISHED post only, in a new tab (owner decision
 * 2026-10-01; a draft preview is TASK-670). Body: the sectioned form with one
 * sticky «Зберегти».
 *
 * A missing post (404) redirects back to the list.
 */
export function EditBlogPostView({ postId }: EditBlogPostViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();

  const { data, isLoading, isError, error } =
    useAdminBlogControllerFindById(postId);
  const update = useAdminBlogControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/blog");
    }
  }, [isNotFound, router]);

  const post = data?.data;

  const handleSubmit = async (values: BlogPostFormValues) => {
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
      if (!confirmed) return;
    }
    update.mutate(
      { id: postId, data: blogPostFormValuesToUpdateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindByIdQueryKey(postId),
          });
          toast.success(d.toastUpdated);
          router.push("/blog");
        },
        onError: () => {
          toast.error(d.toastUpdateFailed);
        },
      },
    );
  };

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
        {post?.status === "PUBLISHED" ? (
          <Button asChild variant="outline">
            <a
              href={`${STOREFRONT_URL}/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLinkIcon aria-hidden="true" />
              {d.rowOpenSite}
            </a>
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <AdminFormSkeleton />
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadOneError}
        </p>
      ) : post ? (
        <BlogPostForm
          id={postId}
          defaultValues={mapPostToFormValues(post)}
          onSubmit={(values) => void handleSubmit(values)}
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
