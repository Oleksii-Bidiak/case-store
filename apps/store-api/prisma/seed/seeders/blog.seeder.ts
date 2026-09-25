import { PrismaClient } from '@prisma/client';
import { sanitizeRichText } from '../../../src/common/sanitize';
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
 * Every post is seeded PUBLISHED with its ISO publish date, its OWN sanitized
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

  for (const post of postsData) {
    const body = postBodiesHtml[post.slug];
    const authorId = authorIds[post.author];
    if (body === undefined || authorId === undefined) {
      // blog.data.spec.ts pins both; this guards a data edit that skipped the spec.
      throw new Error(`Blog seed: post "${post.slug}" has no body or no author row`);
    }
    const publishedAt = new Date(`${post.publishedAt}T09:00:00.000Z`);
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
      // No demo `ogImage` for articles: the seed renders no blog artwork, and an
      // invented URL would demo a broken image (`defaultOgImage` is seeded null
      // for the same reason). A coverless post still previews with the brand
      // card via `buildOgImages`.
      ogImage: null,
      categoryId: categoryIds[post.cat],
      status: 'PUBLISHED' as const,
      publishedAt,
      scheduledAt: null,
    };
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: data,
      create: data,
    });
  }

  console.log(
    `  ✓ Blog: ${categoriesData.length} categories, ${authorsData.length} authors, ` +
      `${postsData.length} posts upserted`,
  );
}
