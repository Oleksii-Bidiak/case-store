"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { dict } from "@/shared/config";

interface EditBlogPostViewProps {
  postId: string;
}

/**
 * Edit-post body: fetches the post by UUID to pre-populate the form, then wires
 * the update mutation, cache invalidation, toasts, and redirect. A missing post
 * (404) redirects back to the list.
 */
export function EditBlogPostView({ postId }: EditBlogPostViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const handleSubmit = (values: BlogPostFormValues) => {
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
          toast.success(dict.blogPosts.toastUpdated);
          router.push("/blog");
        },
        onError: () => {
          toast.error(dict.blogPosts.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/blog"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.blogPosts.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.blogPosts.editHeading}
        </h2>
      </div>

      {isLoading ? (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.blogPosts.loadOneError}
        </p>
      ) : post ? (
        <BlogPostForm
          id={postId}
          defaultValues={mapPostToFormValues(post)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
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
    status: post.status,
    scheduledAt: post.scheduledAt ? toDateTimeLocal(post.scheduledAt) : "",
  };
}

/** Convert an ISO instant to the `datetime-local` input value (local time). */
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
