import { PrismaClient, PublishStatus } from '@prisma/client';
import { sanitizeRichText } from '../../../src/common/sanitize';
import { resolvePublishState } from '../../../src/publishing/resolve-publish-state';
import { renderBannerImage } from '../lib/images/seed-image.generator';
import { createSeedMediaRegistry } from '../lib/media-assets';
import {
  authorsData,
  categoriesData,
  postBodiesHtml,
  postsData,
  readingMinutesFor,
} from '../data/content/blog.data';

/**
 * Seed the blog: 5 categories, the demo authors and the 12 posts that were
 * previously hardcoded in the storefront (`store-client/src/widgets/blog/model/posts.ts`).
 * TASK-2569 added a SCHEDULED and a DRAFT post and a generated cover on every
 * one; the rest are seeded PUBLISHED with their ISO publish date, their OWN sanitized
 * body and a link to its Author row (TASK-554 — all twelve used to share one
 * body, and the author role/bio was a storefront placeholder). Idempotent —
 * upsert by slug for categories and posts, by name for authors (TASK-170).
 */
export async function seedBlog(prisma: PrismaClient) {
  const categoryIds: Record<string, string> = {};
  for (const cat of categoriesData) {
    const record = await prisma.blogCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: cat,
    });
    categoryIds[cat.slug] = record.id;
  }

  // Keyed by the same trimmed name BlogRepository links an admin-typed byline by,
  // so an article saved later from the admin panel lands on the same row.
  const authorIds: Record<string, string> = {};
  for (const author of authorsData) {
    const record = await prisma.author.upsert({
      where: { name: author.name },
      update: { role: author.role, bio: author.bio },
      create: author,
    });
    authorIds[author.name] = record.id;
  }

  const now = new Date();
  const registerAsset = createSeedMediaRegistry(prisma);
  const byStatus: Record<PublishStatus, number> = { PUBLISHED: 0, SCHEDULED: 0, DRAFT: 0 };

  for (const [index, post] of postsData.entries()) {
    const body = postBodiesHtml[post.slug];
    const authorId = authorIds[post.author];
    if (body === undefined || authorId === undefined) {
      // blog.data.spec.ts pins both; this guards a data edit that skipped the spec.
      throw new Error(`Blog seed: post "${post.slug}" has no body or no author row`);
    }
    const publish = publishFieldsFor(post, now);
    byStatus[publish.status]++;
    const cover = await renderBannerImage({
      key: `blog:${post.slug}`,
      ...post.cover,
      variant: index,
      align: 'center',
      alt: `Обкладинка статті «${post.title}»`,
    });
    await registerAsset({ ...cover, tags: ['блог', 'демо'] });
    const data = {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: sanitizeRichText(body),
      authorName: post.author,
      authorId,
      readingMinutes: readingMinutesFor(body),
      featured: post.featured ?? false,
      listed: post.listed ?? true,
      metaTitle: post.metaTitle ?? null,
      metaDescription: post.metaDescription ?? null,
      keywords: post.keywords ?? [],
      // TASK-2569: a generated cover per article. No separate `ogImage`: that
      // column is an admin override, and a post without one already previews
      // with its cover or the brand card (`buildOgImages`).
      coverImageUrl: cover.url,
      coverBlurDataUrl: cover.blurDataUrl,
      ogImage: null,
      categoryId: categoryIds[post.cat],
      ...publish,
    };
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: data,
      create: data,
    });
  }

  const featured = postsData.filter((p) => p.featured).length;
  console.log(
    `  ✓ Blog: ${categoriesData.length} categories, ${authorsData.length} authors, ` +
      `${postsData.length} posts upserted (${byStatus.PUBLISHED} published, ${byStatus.SCHEDULED} scheduled, ` +
      `${byStatus.DRAFT} draft; ${featured} featured; ${postsData.length} covers)`,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A post's publish fields through the domain's `resolvePublishState`. A
 * published post keeps its authored day (09:00 UTC) as `publishedAt` — the
 * archive dates are content — while a scheduled one is always a week out from
 * the run, and the resolver refuses to keep a schedule that is not in the future.
 */
function publishFieldsFor(post: (typeof postsData)[number], now: Date) {
  if (post.state === 'DRAFT') return resolvePublishState({ status: PublishStatus.DRAFT }, now);
  if (post.state) {
    const scheduledAt = new Date(now.getTime() + post.state.scheduledInDays * DAY_MS);
    const resolved = resolvePublishState({ status: PublishStatus.SCHEDULED, scheduledAt }, now);
    if (resolved.status !== PublishStatus.SCHEDULED) {
      throw new Error(`Blog seed: post "${post.slug}" must be scheduled into the future`);
    }
    return resolved;
  }
  if (!post.publishedAt) {
    throw new Error(`Blog seed: published post "${post.slug}" has no publishedAt`);
  }
  return {
    ...resolvePublishState({ status: PublishStatus.PUBLISHED }, now),
    publishedAt: new Date(`${post.publishedAt}T09:00:00.000Z`),
  };
}
