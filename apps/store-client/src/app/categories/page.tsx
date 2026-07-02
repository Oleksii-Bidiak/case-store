import type { Metadata } from "next";
import { CategoriesView } from "@/widgets/categories";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.categoriesTitle,
  description: dict.meta.categoriesDescription,
  alternates: { canonical: `${SITE_URL}/categories` },
};

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
