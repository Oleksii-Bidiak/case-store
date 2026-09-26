import { STORE_NAME } from '../lib/store';
import { catalogueEntries } from './catalogue';
import { categoryTree } from './categories.data';
import { postsData } from './content/blog.data';
import { pagesData } from './content/pages.data';

/**
 * Every seeded `metaTitle` carries the store name (TASK-553).
 *
 * An entity's `metaTitle` is an admin-typed title, and the storefront renders it
 * VERBATIM (`resolveSeo` → `titleAbsolute`): the `%s | <назва>` template is
 * applied only to titles DERIVED from content. So a seeded metaTitle without
 * the name produces a `<title>` without the name — which is what every category
 * page rendered, while product and page titles had it. The rule is checked for
 * every seeded entity kind at once, so the next data file cannot miss it.
 */
const seeded: [string, string][] = [
  ...categoryTree.flatMap((root) => [
    [`category ${root.slug}`, root.metaTitle] as [string, string | undefined],
    ...(root.children ?? []).map(
      (child) => [`category ${child.slug}`, child.metaTitle] as [string, string | undefined],
    ),
  ]),
  ...catalogueEntries.map(
    (entry) => [`product ${entry.slug}`, entry.metaTitle] as [string, string | undefined],
  ),
  ...postsData.map((post) => [`post ${post.slug}`, post.metaTitle] as [string, string | undefined]),
  ...pagesData.map((page) => [`page ${page.slug}`, page.metaTitle] as [string, string | undefined]),
].filter((pair): pair is [string, string] => typeof pair[1] === 'string');

describe('seeded metaTitles (TASK-553)', () => {
  it('seeds a metaTitle on every ROOT category — the part the task is about', () => {
    // Subcategories without one are fine: their title is derived from the name,
    // and a derived title gets the `%s | <назва>` template.
    const withTitle = new Set(seeded.map(([what]) => what));
    expect(categoryTree.filter((root) => !withTitle.has(`category ${root.slug}`))).toEqual([]);
  });

  it.each(seeded)('%s names the store', (_what, metaTitle) => {
    expect(metaTitle).toContain(STORE_NAME);
  });

  it.each(seeded)('%s fits the ~60 characters a result page shows', (_what, metaTitle) => {
    // The storefront's `SEO_TITLE_MAX`: a longer title is cut in the results
    // page, and the name at its END is the first thing lost.
    expect(metaTitle.length).toBeLessThanOrEqual(60);
  });
});
