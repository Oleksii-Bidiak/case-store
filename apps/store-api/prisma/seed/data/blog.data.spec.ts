import { sanitizeRichText } from '../../../src/common/sanitize';
import { authorsData, postBodiesHtml, postsData, readingMinutesFor } from './content/blog.data';

/**
 * Seeded blog content (TASK-554).
 *
 * All 12 seeded articles used to share ONE body — a text about iPhone cameras
 * that showed up under titles about headphones and power banks — and the author
 * card under every article printed the same invented role and bio from the
 * storefront dictionary. These cases pin the replacement: a body of its own per
 * article, and an Author row with a role and bio behind every byline.
 */

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html: string): number {
  return plainText(html)
    .split(' ')
    .filter((token) => /\p{L}/u.test(token)).length;
}

const collapse = (html: string) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

describe('seeded blog bodies', () => {
  it('has exactly one body per seeded post — no missing slug, no orphan body', () => {
    expect(Object.keys(postBodiesHtml).sort()).toEqual(postsData.map((p) => p.slug).sort());
  });

  it('gives every post a DIFFERENT body', () => {
    const bodies = postsData.map((p) => collapse(postBodiesHtml[p.slug]));
    expect(new Set(bodies).size).toBe(postsData.length);
  });

  it.each(postsData.map((p) => [p.slug]))('%s is a 150–300 word article', (slug) => {
    const words = wordCount(postBodiesHtml[slug]);
    expect(words).toBeGreaterThanOrEqual(150);
    expect(words).toBeLessThanOrEqual(300);
  });

  it.each(postsData.map((p) => [p.slug]))(
    '%s has at least two h2 sections for the table of contents',
    (slug) => {
      expect(postBodiesHtml[slug].match(/<h2>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(postsData.map((p) => [p.slug]))(
    '%s survives the rich-text sanitizer with nothing stripped',
    (slug) => {
      const body = postBodiesHtml[slug];
      expect(collapse(sanitizeRichText(body))).toBe(collapse(body));
    },
  );

  it('derives the reading time from the body, never below one minute', () => {
    expect(readingMinutesFor('<p>одне слово</p>')).toBe(1);
    expect(readingMinutesFor(`<p>${'слово '.repeat(360)}</p>`)).toBe(2);
    for (const post of postsData) {
      expect(readingMinutesFor(postBodiesHtml[post.slug])).toBe(
        Math.max(1, Math.round(wordCount(postBodiesHtml[post.slug]) / 180)),
      );
    }
  });

  it('no longer carries the shared iPhone-camera demo text', () => {
    for (const post of postsData.filter((p) => p.slug !== 'iphone16-vs-15')) {
      expect(postBodiesHtml[post.slug]).not.toContain('Нічний режим');
    }
  });
});

describe('seeded blog authors', () => {
  it('backs every byline with an author row', () => {
    const names = new Set(authorsData.map((a) => a.name));
    for (const post of postsData) {
      expect(names).toContain(post.author);
    }
  });

  it('gives every author a role and a bio of their own', () => {
    for (const author of authorsData) {
      expect(author.role.trim()).not.toBe('');
      expect(author.bio.trim()).not.toBe('');
    }
    expect(new Set(authorsData.map((a) => a.bio)).size).toBe(authorsData.length);
    expect(new Set(authorsData.map((a) => a.name)).size).toBe(authorsData.length);
  });

  it('seeds no author without an article', () => {
    const bylines = new Set(postsData.map((p) => p.author));
    for (const author of authorsData) {
      expect(bylines).toContain(author.name);
    }
  });
});
