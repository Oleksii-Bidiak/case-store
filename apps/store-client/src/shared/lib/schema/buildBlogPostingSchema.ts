/** Inputs for a Schema.org BlogPosting graph. */
export interface BuildBlogPostingSchemaInput {
  /** Absolute canonical URL of the article. */
  url: string;
  /** Article title. */
  headline: string;
  /** Short summary (optional). */
  description?: string;
  /** ISO 8601 publish date (optional). */
  datePublished?: string;
  /**
   * ISO 8601 last-edit instant (TASK-556) — the post's `updatedAt`. Google uses
   * it to decide an article is fresh; without it every edit looked like none.
   */
  dateModified?: string;
  /**
   * Absolute URL of the article's picture (TASK-556) — the cover. Google lists
   * `image` as a recommended Article property; without it a post is not
   * eligible for the image-bearing result types at all.
   */
  image?: string;
  /** Author display name. */
  authorName: string;
  /** Publisher / site name. */
  siteName: string;
}

/**
 * Build a Schema.org BlogPosting JSON-LD graph. Pure function — unit-testable.
 * Optional fields are omitted (not emitted as null) when absent.
 */
export function buildBlogPostingSchema(
  input: BuildBlogPostingSchemaInput,
): Record<string, unknown> {
  // A media-library cover can be a site-relative `/uploads/…` path; a relative
  // `image` is useless to a crawler, so it is resolved against the article URL.
  const image = absolutize(input.image, input.url);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(image ? { image: [image] } : {}),
    author: { "@type": "Person", name: input.authorName },
    publisher: { "@type": "Organization", name: input.siteName },
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    url: input.url,
  };
}

/** Absolute URLs pass through; a site-relative path is joined onto `base`. */
function absolutize(
  url: string | null | undefined,
  base: string,
): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return undefined;
  }
}
