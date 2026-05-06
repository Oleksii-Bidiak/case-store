/**
 * Generate a URL-friendly slug from a name string.
 *
 * Converts to lowercase, replaces spaces and underscores with hyphens,
 * removes special characters, and collapses multiple hyphens.
 *
 * Used by ProductService and CategoryService for auto-generating slugs
 * when not provided by the client.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}
