import { PrismaClient } from '@prisma/client';
import { sanitizeRichText } from '../../../src/common/sanitize';
import { categoriesData, demoBodyHtml, postsData } from '../data/content/blog.data';

/**
 * Seed the blog: 5 categories + the 12 posts that were previously hardcoded in
 * the storefront (`store-client/src/widgets/blog/model/posts.ts`). Every post is
 * seeded PUBLISHED with the ISO publish date from that file, and shares the demo
 * article body (moved server-side from the storefront). Idempotent — upsert by
 * slug for both categories and posts (TASK-170).
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

  const demoBody = sanitizeRichText(demoBodyHtml);

  for (const post of postsData) {
    const publishedAt = new Date(`${post.publishedAt}T09:00:00.000Z`);
    const data = {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: demoBody,
      authorName: post.author,
      readingMinutes: post.readingMinutes,
      featured: post.featured ?? false,
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

  console.log(`  ✓ Blog: ${categoriesData.length} categories, ${postsData.length} posts upserted`);
}
