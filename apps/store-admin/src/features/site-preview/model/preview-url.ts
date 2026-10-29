import { STOREFRONT_URL } from "@/shared/config";

/**
 * The shareable preview link (plan 186, TASK-669/670): the storefront's
 * `/preview` route checks the token with the API, switches draft mode on and
 * redirects to the previewed page. The token is opaque — encoded, never parsed.
 */
export function previewUrl(token: string, origin = STOREFRONT_URL): string {
  return `${origin.replace(/\/+$/, "")}/preview?token=${encodeURIComponent(token)}`;
}
