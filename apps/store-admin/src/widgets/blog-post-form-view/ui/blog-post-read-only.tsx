"use client";

import type { BlogPostEntity } from "@/entities/blog";
import {
  ReadOnlyBool,
  ReadOnlyField,
  ReadOnlyImage,
  ReadOnlyLayout,
  ReadOnlyLink,
  ReadOnlyNotice,
  ReadOnlyRichText,
  ReadOnlySection,
  ReadOnlyTags,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";

const f = dict.blogPostForm;
const rv = dict.readOnlyView;

const STATUS_LABELS: Record<BlogPostEntity["status"], string> = {
  PUBLISHED: f.statusPublished,
  DRAFT: f.statusDraft,
  SCHEDULED: f.statusScheduled,
};

/**
 * The article without `blog:write` (TASK-667 template): the form's six
 * sections «Основне · Вміст · Обкладинка · Показ у блозі · SEO і соцмережі ·
 * Публікація» as text, the body as the site renders it. Built from the entity
 * itself — the category is a name here, not an id. Not a link: its edit
 * dialog opens only with `blog:write`, which this viewer lacks.
 */
export function BlogPostReadOnly({ post }: { post: BlogPostEntity }) {
  const path = `${f.slugPrefix}${post.slug}`;
  const keywords = post.keywords ?? [];
  return (
    <div className="flex flex-col gap-4">
      <ReadOnlyNotice>{rv.notices.blog}</ReadOnlyNotice>
      <ReadOnlyLayout>
        <ReadOnlySection title={f.sectionMain}>
          <ReadOnlyField label={f.title}>{post.title}</ReadOnlyField>
          <ReadOnlyField label={f.slug} mono>
            {post.status === "PUBLISHED" ? (
              <ReadOnlyLink href={`${STOREFRONT_URL}${path}`} external>
                {path}
              </ReadOnlyLink>
            ) : (
              path
            )}
          </ReadOnlyField>
          <ReadOnlyField label={f.category}>{post.category.name}</ReadOnlyField>
          <ReadOnlyField label={f.author}>{post.authorName}</ReadOnlyField>
          <ReadOnlyField label={f.excerpt} multiline>
            {post.excerpt}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionContent}>
          <ReadOnlyField
            label={f.content}
            empty={!post.content.replace(/<[^>]*>/g, "").trim()}
          >
            <ReadOnlyRichText html={post.content} />
          </ReadOnlyField>
          <ReadOnlyField
            label={f.readingMinutes}
            emptyConsequence={rv.blogReadingEmpty}
          >
            {post.readingMinutes ?? null}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionCover}>
          <ReadOnlyField label={f.coverUpload.alt}>
            {post.coverImageUrl ? (
              <ReadOnlyImage src={post.coverImageUrl} alt={f.coverUpload.alt} />
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionShow}>
          <ReadOnlyField label={f.featured}>
            <ReadOnlyBool
              value={post.featured}
              on={rv.blogFeaturedOn}
              off={rv.blogFeaturedOff}
            />
          </ReadOnlyField>
          <ReadOnlyField label={f.listed}>
            <ReadOnlyBool
              value={post.listed}
              on={rv.blogListedOn}
              off={dict.blogPosts.unlistedBadge}
            />
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionSeo}>
          <ReadOnlyField
            label={f.metaTitle}
            emptyConsequence={rv.seoTitleFromName}
          >
            {post.metaTitle}
          </ReadOnlyField>
          <ReadOnlyField
            label={f.metaDescription}
            emptyConsequence={rv.seoDescriptionFromText}
          >
            {post.metaDescription}
          </ReadOnlyField>
          <ReadOnlyField
            label={dict.seoFields.keywords}
            empty={keywords.length === 0}
          >
            <ReadOnlyTags tags={keywords} />
          </ReadOnlyField>
          <ReadOnlyField
            label={dict.seoFields.ogImage}
            emptyConsequence={rv.ogImageDefault}
          >
            {post.ogImage ? (
              <ReadOnlyImage src={post.ogImage} alt={dict.seoFields.ogImage} />
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionPublish}>
          <ReadOnlyField label={f.status}>
            {STATUS_LABELS[post.status]}
          </ReadOnlyField>
          {post.status === "SCHEDULED" ? (
            <ReadOnlyField label={f.scheduledAt}>
              {post.scheduledAt ? formatDateTime(post.scheduledAt) : null}
            </ReadOnlyField>
          ) : null}
        </ReadOnlySection>
      </ReadOnlyLayout>
    </div>
  );
}
