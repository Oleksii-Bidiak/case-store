import { Suspense } from "react";
import type { Metadata } from "next";
import {
  HeroBanner,
  CategoryNav,
  CategoryNavSkeleton,
  ProductGrid,
  ProductGridSkeleton,
} from "@/widgets";
import { JsonLd } from "@/shared/ui";
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
} from "@/shared/lib/schema";
import { SITE_URL, SITE_NAME } from "@/shared/config";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Discover premium mobile accessories — cases, chargers, screen protectors and more.",
};

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 pb-16">
      <JsonLd schema={buildOrganizationSchema(SITE_URL, SITE_NAME)} />
      <JsonLd schema={buildWebSiteSchema(SITE_URL, SITE_NAME)} />
      <HeroBanner />

      <section
        aria-labelledby="categories-heading"
        className="mx-auto w-full max-w-7xl px-4"
      >
        <h2
          id="categories-heading"
          className="mb-6 text-2xl font-bold tracking-tight text-foreground"
        >
          Shop by Category
        </h2>
        <Suspense fallback={<CategoryNavSkeleton />}>
          <CategoryNav />
        </Suspense>
      </section>

      <section
        aria-labelledby="latest-products-heading"
        className="mx-auto w-full max-w-7xl px-4"
      >
        <h2
          id="latest-products-heading"
          className="mb-6 text-2xl font-bold tracking-tight text-foreground"
        >
          Latest Products
        </h2>
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductGrid />
        </Suspense>
      </section>
    </div>
  );
}
