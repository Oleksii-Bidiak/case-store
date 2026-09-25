"use client";

import { dict } from "@/shared/config";
import { useAttributeDefinitionControllerFacetCeiling } from "@/entities/attribute-definition";

const d = dict.attributeDefinitions;

interface FacetCeilingNoticeProps {
  categoryId: string;
}

/**
 * Admin signal for the storefront facet ceiling (TASK-707).
 *
 * The public facet endpoint returns at most `limit` facets per category, in
 * template order, so a category that declares more loses the tail of its
 * sidebar — and before this notice nothing in the panel said so. Covers the
 * category's whole SUBTREE: definitions are inherited, so a facet added here
 * can push a subcategory over the ceiling while this category stays under it.
 *
 * Renders nothing while loading and nothing when every category fits; says so
 * when the check itself failed, so a failed check never reads as "all fine".
 */
export function FacetCeilingNotice({ categoryId }: FacetCeilingNoticeProps) {
  const query = useAttributeDefinitionControllerFacetCeiling(categoryId);

  if (query.isError) {
    return (
      <p className="text-sm text-muted-foreground">{d.facetCeilingLoadError}</p>
    );
  }

  const report = query.data?.data;
  if (!report || report.categories.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
    >
      <p className="font-medium">{d.facetCeilingTitle(report.limit)}</p>
      <ul className="flex flex-col gap-0.5">
        {report.categories.map((category) => (
          <li key={category.categoryId}>
            {d.facetCeilingCategory(
              category.categoryName,
              category.facetCount,
              category.overflowLabels,
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{d.facetCeilingHint}</p>
    </div>
  );
}
