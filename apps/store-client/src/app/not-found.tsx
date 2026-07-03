import type { Metadata } from "next";
import { NotFoundView } from "@/widgets/not-found";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.notFoundTitle,
  description: dict.meta.notFoundDescription,
  // A 404 carries no indexable content, but crawlers may still follow its links.
  robots: { index: false, follow: true },
};

/**
 * Global 404 — Next.js renders this for unmatched routes and for any
 * `notFound()` call. It sits inside the root layout, so the shared Header and
 * Footer wrap {@link NotFoundView} automatically.
 */
export default function NotFound() {
  return <NotFoundView />;
}
