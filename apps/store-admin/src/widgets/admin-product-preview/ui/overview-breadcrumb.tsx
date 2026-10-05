import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { dict } from "@/shared/config";

const o = dict.productOverview;

/** «← Товари / Огляд товару» — the way back, kept on every state of the page. */
export function OverviewBreadcrumb({ href }: { href: string }) {
  return (
    <nav aria-label={o.breadcrumbAria}>
      <ol className="flex items-center gap-2 text-sm">
        <li>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            {o.back}
          </Link>
        </li>
        <li aria-hidden="true" className="text-muted-foreground">
          /
        </li>
        <li aria-current="page" className="text-muted-foreground">
          {o.heading}
        </li>
      </ol>
    </nav>
  );
}
