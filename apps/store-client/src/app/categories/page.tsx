import type { Metadata } from "next";
import { CategoriesView } from "@/widgets/categories";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { buildHubMetadata } from "@/shared/lib/seo";
import { SITE_URL, dict } from "@/shared/config";

// TASK-435 — title/description now come from the `categories` HUB page row, so
// the owner can tune this listing's search result from the panel. The dictionary
// strings below stay as the fallback for "no row yet / API down".
export function generateMetadata(): Promise<Metadata> {
  return buildHubMetadata({
    slug: "categories",
    canonical: `${SITE_URL}/categories`,
    fallbackTitle: dict.meta.categoriesTitle,
    fallbackDescription: dict.meta.categoriesDescription,
  });
}

export default function CategoriesPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.categories.breadcrumbHome, item: SITE_URL },
          { name: dict.meta.categoriesTitle, item: `${SITE_URL}/categories` },
        ])}
      />
      <CategoriesView />
    </div>
  );
}
