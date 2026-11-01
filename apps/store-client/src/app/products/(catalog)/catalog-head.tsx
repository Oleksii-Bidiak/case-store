import { Fragment } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dict, H1_CLASS } from "@/shared/config";

export interface CatalogHeadCrumb {
  name: string;
  /** Absent for the current page (the last crumb). */
  href?: string;
}

interface CatalogHeadProps {
  /** «Головна › … › current» — shown from `md`. */
  trail: CatalogHeadCrumb[];
  /** The one step up — shown below `md` instead of the trail. */
  back: { label: string; href: string };
  title: string;
}

/**
 * The catalogue head (Д3-2 Catalog §3), shared by `/products` and
 * `/categories/[slug]`: the breadcrumb trail from `md`, one back pill below it
 * («‹ Головна» / «‹ Каталог» / «‹ {батько}») — a phone has no room for a
 * four-level trail, and one step up is what it is used for — then the H1.
 * The count line under the H1 is the listing's own (it knows the filters).
 */
export function CatalogHead({ trail, back, title }: CatalogHeadProps) {
  return (
    <div>
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-3.5 hidden flex-wrap items-center gap-1.5 text-sm text-muted-foreground md:flex"
      >
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <Fragment key={`${crumb.name}-${i}`}>
              {i > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-50"
                />
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="rounded-sm underline-offset-3 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {crumb.name}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={
                    isLast ? "font-semibold text-foreground" : undefined
                  }
                >
                  {crumb.name}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      <Link
        href={back.href}
        aria-label={dict.catalog.backAria(back.label)}
        className="mb-1 -ml-2 inline-flex h-11 max-w-full items-center gap-1 rounded-full pr-3 pl-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none md:hidden"
      >
        <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{back.label}</span>
      </Link>

      <h1 className={`${H1_CLASS} text-foreground`}>{title}</h1>
    </div>
  );
}
