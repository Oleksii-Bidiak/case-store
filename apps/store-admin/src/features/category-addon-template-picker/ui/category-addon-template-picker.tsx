"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAddonServiceControllerGetCategoryTemplateQueryKey,
  getAddonServiceControllerResolveCategoryTemplateQueryKey,
  useAddonServiceControllerAdminFindActive,
  useAddonServiceControllerGetCategoryTemplate,
  useAddonServiceControllerResolveCategoryTemplate,
  useAddonServiceControllerSetCategoryTemplate,
} from "@/entities/addon-service";
import { Button, Label } from "@/shared/ui";
import { dict } from "@/shared/config";

interface CategoryAddonTemplatePickerProps {
  /** The category being edited. The picker is hidden in create mode (no id yet). */
  categoryId: string;
}

/**
 * Category add-on template picker (TASK-174).
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
 * Save is explicit (its own button) so it cannot silently ride along with the
 * host category form's submit — templates affect a whole subtree, and an admin
 * should mean it.
 */
export function CategoryAddonTemplatePicker({
  categoryId,
}: CategoryAddonTemplatePickerProps) {
  const queryClient = useQueryClient();

  const activeServices = useAddonServiceControllerAdminFindActive();
  const ownTemplate = useAddonServiceControllerGetCategoryTemplate(categoryId);
  const resolved = useAddonServiceControllerResolveCategoryTemplate(categoryId);
  const save = useAddonServiceControllerSetCategoryTemplate();

  const persistedIds = ownTemplate.data?.data.addonServiceIds;

  // forms.md: the selection is seeded from ASYNC server data, so it needs a sync
  // guard — seed ONCE per category, then let the user own it, so a background
  // refetch cannot stomp an in-progress edit. Implemented as a RENDER-TIME guard
  // (React's documented pattern for derived-from-prop resets) rather than an
  // effect, which would fire a cascading render.
  const [selected, setSelected] = useState<string[]>([]);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (persistedIds && seededFor !== categoryId) {
    setSeededFor(categoryId);
    setSelected(persistedIds);
  }

  const services = activeServices.data?.data ?? [];
  const source = resolved.data?.data.source;
  const sourceName = resolved.data?.data.sourceCategoryName;

  const toggle = (addonServiceId: string) => {
    setSelected((prev) =>
      prev.includes(addonServiceId)
        ? prev.filter((id) => id !== addonServiceId)
        : [...prev, addonServiceId],
    );
  };

  const handleSave = () => {
    save.mutate(
      { categoryId, data: { addonServiceIds: selected } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getAddonServiceControllerGetCategoryTemplateQueryKey(categoryId),
          });
          void queryClient.invalidateQueries({
            queryKey:
              getAddonServiceControllerResolveCategoryTemplateQueryKey(
                categoryId,
              ),
          });
          toast.success(dict.categories.addonTemplate.toastSaved);
        },
        onError: () => toast.error(dict.categories.addonTemplate.toastFailed),
      },
    );
  };

  const isLoading = activeServices.isLoading || ownTemplate.isLoading;
  const isError = activeServices.isError || ownTemplate.isError;

  return (
    <section className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold text-foreground">
          {dict.categories.addonTemplate.heading}
        </h3>
        <p className="text-sm text-muted-foreground">
          {dict.categories.addonTemplate.hint}
        </p>
      </div>

      {/* Inheritance affordance — only meaningful once the resolve call lands. */}
      {source === "inherited" && sourceName && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {dict.categories.addonTemplate.inheritedFrom(sourceName)}
        </p>
      )}
      {source === "none" && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {dict.categories.addonTemplate.noneAnywhere}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-6 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.categories.addonTemplate.loadError}
        </p>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.categories.addonTemplate.emptyCatalog}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {services.map((service) => {
            const checked = selected.includes(service.id);
            return (
              <li key={service.id} className="flex items-center gap-2">
                <input
                  id={`addon-template-${service.id}`}
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={checked}
                  onChange={() => toggle(service.id)}
                />
                <Label
                  htmlFor={`addon-template-${service.id}`}
                  className="flex-1 font-normal"
                >
                  {service.name}
                </Label>
                <span className="font-mono text-sm text-muted-foreground">
                  {service.price}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending || isLoading || isError}
          onClick={handleSave}
        >
          {save.isPending
            ? dict.common.saving
            : dict.categories.addonTemplate.save}
        </Button>
        {selected.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {dict.categories.addonTemplate.clearedNote}
          </p>
        )}
      </div>
    </section>
  );
}
