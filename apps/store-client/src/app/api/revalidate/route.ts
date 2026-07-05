import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * On-demand ISR revalidation endpoint (TASK-187).
 *
 * The store-api `RevalidationNotifier` POSTs here after an admin publishes /
 * unpublishes / edits published content, and when the publishing cron flips a
 * scheduled item live. Authenticated with a shared secret carried in the
 * `x-revalidate-secret` header (compared against `REVALIDATE_SECRET`).
 *
 * Body: `{ tags?: string[]; paths?: string[] }` → each tag is passed to
 * `revalidateTag`, each path to `revalidatePath`.
 *
 * Security:
 * - 503 when the secret is not configured in production (fail closed rather than
 *   accept unauthenticated purges).
 * - 401 on a missing / mismatched secret.
 */
interface RevalidateBody {
  tags?: string[];
  paths?: string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret) {
    // Unconfigured: in production this must fail closed; in dev it is a no-op
    // signal that revalidation is simply not wired up.
    const status = process.env.NODE_ENV === "production" ? 503 : 200;
    return NextResponse.json(
      { error: "Revalidation is not configured", statusCode: status },
      { status },
    );
  }

  const provided = request.headers.get("x-revalidate-secret");
  if (!provided || provided !== secret) {
    return NextResponse.json(
      { error: "Unauthorized", statusCode: 401 },
      { status: 401 },
    );
  }

  let body: RevalidateBody;
  try {
    body = (await request.json()) as RevalidateBody;
  } catch {
    body = {};
  }

  const tags = Array.isArray(body.tags) ? body.tags : [];
  const paths = Array.isArray(body.paths) ? body.paths : [];

  // The vendored next@16 types declare a second, mandatory `profile` arg on
  // revalidateTag — that signature is not the real runtime API (revalidateTag
  // takes a single tag). Cast to the real one-arg signature.
  const revalidateTagOne = revalidateTag as (tag: string) => void;

  for (const tag of tags) {
    if (typeof tag === "string" && tag.length > 0) {
      revalidateTagOne(tag);
    }
  }
  for (const path of paths) {
    if (typeof path === "string" && path.length > 0) {
      revalidatePath(path);
    }
  }

  return NextResponse.json({
    data: { revalidated: true, tags, paths, now: Date.now() },
  });
}
