import { RegistryHeader, Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.catalogImport;

/**
 * Route placeholder for `/catalog-import` (CatalogImportProposal ІК14): the
 * page's own heading, the three steps, the drop zone and the history — the
 * dashboard's skeleton showed here before (canon 1.7).
 */
export function CatalogImportSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <RegistryHeader title={d.heading} description={d.intro} />
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {[d.stepFile, d.stepReview, d.stepWrite].map((title) => (
          <Skeleton key={title} className="h-10 w-32" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-lg" />
      <Skeleton className="mt-2 h-5 w-48" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
    </div>
  );
}
