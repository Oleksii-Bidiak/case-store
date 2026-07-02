import type { Metadata } from "next";
import Link from "next/link";
import { BlogView } from "@/widgets/blog";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.blogTitle,
  description: dict.meta.blogDescription,
};

export default function BlogPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.blog.breadcrumbHome, item: SITE_URL },
          { name: dict.blog.breadcrumb, item: `${SITE_URL}/blog` },
        ])}
      />

      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-5 flex items-center gap-[9px] text-[13.5px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.blog.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">
          {dict.blog.breadcrumb}
        </span>
      </nav>

      <BlogView />
    </div>
  );
}
