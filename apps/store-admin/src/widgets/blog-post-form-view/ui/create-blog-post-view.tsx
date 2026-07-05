"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BlogPostForm,
  blogPostFormValuesToCreateDto,
  type BlogPostFormValues,
} from "@/features/blog-post-form";
import {
  getAdminBlogControllerFindAllQueryKey,
  useAdminBlogControllerCreate,
} from "@/entities/blog";
import { dict } from "@/shared/config";

/**
 * Create-post body: renders the form and wires the create mutation, list-cache
 * invalidation, toasts, and redirect back to the list.
 */
export function CreateBlogPostView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminBlogControllerCreate();

  const handleSubmit = (values: BlogPostFormValues) => {
    create.mutate(
      { data: blogPostFormValuesToCreateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindAllQueryKey(),
          });
          toast.success(dict.blogPosts.toastCreated);
          router.push("/blog");
        },
        onError: () => {
          toast.error(dict.blogPosts.toastCreateFailed);
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
        <h2 className="text-2xl font-bold text-foreground">
          {dict.blogPosts.createHeading}
        </h2>
      </div>

      <BlogPostForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.blogPosts.createSubmit}
      />
    </div>
  );
}
