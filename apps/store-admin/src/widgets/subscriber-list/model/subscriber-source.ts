import { dict } from "@/shared/config";

const d = dict.subscribers;

/**
 * The storefront tags every opt-in with where it happened
 * (`NewsletterSubscribeForm source="home" | "promo" | "blog"`, TASK-237); the
 * panel used to print that key raw. A person reads the place instead. A key
 * nobody mapped yet is shown as it is rather than hidden — an unexplained
 * «tiktok» is information, a blank is not.
 */
const SOURCE_LABELS: Record<string, string> = {
  home: d.sourceHome,
  promo: d.sourcePromo,
  blog: d.sourceBlog,
  footer: d.sourceFooter,
};

export function subscriberSourceLabel(
  source: string | null | undefined,
): string {
  const key = source?.trim();
  if (!key) return d.sourceEmpty;
  return SOURCE_LABELS[key.toLowerCase()] ?? key;
}
