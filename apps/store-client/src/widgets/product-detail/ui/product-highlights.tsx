import { dict } from "@/shared/config";
import type { ProductSpecEntity } from "@/entities/product";
import { formatSpecValue } from "./format-spec";

/**
 * ProductHighlights — the PDP "Коротко про товар" strip (TASK-191): a compact
 * label/value grid of the product's top filterable specs, shown near the title.
 * Renders nothing when there are no highlights, matching the page's "no
 * invented data" posture (TASK-167-M).
 */
export function ProductHighlights({
  highlights,
}: {
  highlights: ProductSpecEntity[];
}) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={dict.product.highlightsTitle}
      className="rounded-[14px] border border-border bg-card p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        {dict.product.highlightsTitle}
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {highlights.map((spec) => (
          <div
            key={spec.key}
            className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1.5"
          >
            <dt className="text-[13px] text-muted-foreground">{spec.label}</dt>
            <dd className="text-[13px] font-medium text-foreground">
              {formatSpecValue(spec)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
