import { PublishStatus } from '@prisma/client';
import { BlogPostEntity } from './blog-post.entity';

const row = {
  id: 'post-1',
  slug: 'powerbank-guide',
  title: 'Гайд по павербанках',
  excerpt: 'Коротко.',
  content: '<p>Текст</p>',
  coverImageUrl: null,
  coverBlurDataUrl: null,
  authorName: 'Ірина Ткач',
  readingMinutes: 5,
  featured: false,
  listed: true,
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-06-22T09:00:00.000Z'),
  scheduledAt: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-22T09:00:00.000Z'),
  category: { id: 'cat-1', slug: 'guides', name: 'Гайди' },
};

describe('BlogPostEntity.fromPrisma — author (TASK-554)', () => {
  it('exposes the linked author with role and bio', () => {
    const entity = BlogPostEntity.fromPrisma({
      ...row,
      author: { id: 'author-1', name: 'Ірина Ткач', role: 'Редакторка', bio: 'Пише гайди.' },
    });

    expect(entity.author).toEqual({
      id: 'author-1',
      name: 'Ірина Ткач',
      role: 'Редакторка',
      bio: 'Пише гайди.',
    });
    expect(entity.authorName).toBe('Ірина Ткач');
  });

  it('is null for a post with no linked author — never an invented one', () => {
    expect(BlogPostEntity.fromPrisma({ ...row, author: null }).author).toBeNull();
    expect(BlogPostEntity.fromPrisma(row).author).toBeNull();
  });

  it('does not leak the raw author foreign key', () => {
    const entity = BlogPostEntity.fromPrisma({
      ...row,
      authorId: 'author-1',
      author: { id: 'author-1', name: 'Ірина Ткач', role: null, bio: null },
    } as Parameters<typeof BlogPostEntity.fromPrisma>[0]);

    expect(entity).not.toHaveProperty('authorId');
    expect(entity.author).toEqual({ id: 'author-1', name: 'Ірина Ткач', role: null, bio: null });
  });
});
