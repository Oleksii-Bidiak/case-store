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
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    author: { "@type": "Person", name: input.authorName },
    publisher: { "@type": "Organization", name: input.siteName },
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    url: input.url,
  };
}
