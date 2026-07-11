import { getIndexNowKey } from "@/shared/lib/seo/indexnow";

/**
 * IndexNow ownership key file (TASK-282, plan 144). The IndexNow protocol
 * verifies domain ownership by fetching the plain-text key from the
 * `keyLocation` URL submitted in each ping (`shared/lib/seo/indexnow.ts` points
 * here). Serves the raw `INDEXNOW_KEY` value; 404s when the key is not
 * configured so no stale/empty key file is ever exposed.
 */
export async function GET(): Promise<Response> {
  const key = getIndexNowKey();

  if (!key) {
    return new Response(null, { status: 404 });
  }

  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
