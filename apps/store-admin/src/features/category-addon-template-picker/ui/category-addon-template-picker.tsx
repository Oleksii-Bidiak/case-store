"use client";

import { useId } from "react";
import { Label } from "@/shared/ui";
import { formatCurrency } from "@/shared/lib/format";
import { dict } from "@/shared/config";
import type { CategoryAddonTemplateApi } from "../model/use-category-addon-template";

const d = dict.categories.addonTemplate;

interface CategoryAddonTemplatePickerProps {
  /** State from `useCategoryAddonTemplate` — the form's «Зберегти» saves it. */
  template: CategoryAddonTemplateApi;
  /** The section's id — the anchor of the form's section index. */
  id?: string;
}

/**
 * Category add-on template picker (TASK-174), a section of the category form
 * since wave 198 (CategoriesProposal КТ5).
 *
 * A category's template is the set of add-on services offered on every product
 * filed under it — AND under its subcategories, live, by inheritance. The rules
 * this panel makes visible:
 *
 *   - a category with NO template of its own INHERITS its nearest ancestor's
 *     (the "успадковано з «X»" note);
 *   - the moment it declares even one service of its own, that fully REPLACES
 *     the inherited set for its whole subtree — it is a shadow, not a merge;
 *   - clearing every checkbox is therefore a meaningful action, not a no-op: it
 *     removes the own template and hands the category back to inheritance.
 *
 * It no longer has a button of its own: one «Зберегти» saves the whole form,
 * this section included, and the sticky bar names it among the unsaved
 * sections — so it cannot silently ride along, nor be silently forgotten.
 */
export function CategoryAddonTemplatePicker({
  template,
  id,
}: CategoryAddonTemplatePickerProps) {
  const headingId = useId();
  const { services, selected, toggle, isLoading, isError, source, sourceName } =
    template;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {dict.categoryForm.sectionAddons}
        </h3>
        <p className="text-xs text-muted-foreground">{d.hint}</p>
      </div>

      {/* Inheritance affordance — only meaningful once the resolve call lands. */}
      {source === "inherited" && sourceName && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {d.inheritedFrom(sourceName)}
        </p>
      )}
      {source === "none" && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {d.noneAnywhere}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-6 w-full animate-pulse rounded bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground">{d.emptyCatalog}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border">
          {services.map((service) => {
            const checked = selected.includes(service.id);
            const inputId = `addon-template-${service.id}`;
            return (
              <li
                key={service.id}
                className="flex min-h-11 items-center gap-3 px-3 py-2"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={checked}
                  onChange={() => toggle(service.id)}
                />
                <Label htmlFor={inputId} className="flex-1 font-normal">
                  {service.name}
                </Label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatCurrency(service.price)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!isLoading && !isError && selected.length === 0 && (
        <p className="text-xs text-muted-foreground">{d.clearedNote}</p>
      )}
    </section>
  );
}
