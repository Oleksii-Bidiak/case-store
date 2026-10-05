"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAddonServiceControllerGetCategoryTemplateQueryKey,
  getAddonServiceControllerResolveCategoryTemplateQueryKey,
  useAddonServiceControllerAdminFindActive,
  useAddonServiceControllerGetCategoryTemplate,
  useAddonServiceControllerResolveCategoryTemplate,
  useAddonServiceControllerSetCategoryTemplate,
  type AddonServiceEntity,
  type ResolvedCategoryTemplateEntity,
} from "@/entities/addon-service";

export interface CategoryAddonTemplateApi {
  /** Active catalogue services to choose from. */
  services: AddonServiceEntity[];
  /** The ticked ids, in the order they were ticked (the PATCH order). */
  selected: string[];
  toggle: (addonServiceId: string) => void;
  /** The selection differs from what the server holds. */
  isDirty: boolean;
  /** Put the selection back to what the server holds. */
  discard: () => void;
  /**
   * Write the selection (a full replacement set — an empty one hands the
   * category back to inheritance). Resolves on success, REJECTS on failure so
   * the form's one «Зберегти» can stop there and say what did not save.
   */
  save: () => Promise<void>;
  isSaving: boolean;
  isLoading: boolean;
  isError: boolean;
  /** Where the effective set comes from — drives the inheritance note. */
  source: ResolvedCategoryTemplateEntity["source"] | undefined;
  sourceName: string | null | undefined;
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * The add-on template of one category (TASK-174) as form state (wave 198,
 * КТ5): the picker renders it, the category form's single «Зберегти» saves it.
 *
 * forms.md: the selection is seeded from ASYNC server data, so it has a
 * render-time sync guard — seeded ONCE per category, then the operator owns
 * it; a background refetch cannot stomp an in-progress edit. The `baseline`
 * is what the server holds as far as this screen knows — moved forward on a
 * successful save, so the section reads clean without waiting for a refetch.
 */
export function useCategoryAddonTemplate(
  categoryId: string,
): CategoryAddonTemplateApi {
  const queryClient = useQueryClient();

  const activeServices = useAddonServiceControllerAdminFindActive();
  const ownTemplate = useAddonServiceControllerGetCategoryTemplate(categoryId);
  const resolved = useAddonServiceControllerResolveCategoryTemplate(categoryId);
  const mutation = useAddonServiceControllerSetCategoryTemplate();
  const { mutateAsync } = mutation;

  const persistedIds = ownTemplate.data?.data.addonServiceIds;

  const [selected, setSelected] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<string[]>([]);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (persistedIds && seededFor !== categoryId) {
    setSeededFor(categoryId);
    setSelected(persistedIds);
    setBaseline(persistedIds);
  }

  const toggle = useCallback((addonServiceId: string) => {
    setSelected((prev) =>
      prev.includes(addonServiceId)
        ? prev.filter((id) => id !== addonServiceId)
        : [...prev, addonServiceId],
    );
  }, []);

  const discard = useCallback(() => setSelected(baseline), [baseline]);

  const save = useCallback(async () => {
    const ids = selected;
    await mutateAsync({ categoryId, data: { addonServiceIds: ids } });
    setBaseline(ids);
    void queryClient.invalidateQueries({
      queryKey:
        getAddonServiceControllerGetCategoryTemplateQueryKey(categoryId),
    });
    void queryClient.invalidateQueries({
      queryKey:
        getAddonServiceControllerResolveCategoryTemplateQueryKey(categoryId),
    });
  }, [categoryId, mutateAsync, queryClient, selected]);

  return {
    services: activeServices.data?.data ?? [],
    selected,
    toggle,
    isDirty: seededFor === categoryId && !sameSet(selected, baseline),
    discard,
    save,
    isSaving: mutation.isPending,
    isLoading: activeServices.isLoading || ownTemplate.isLoading,
    isError: activeServices.isError || ownTemplate.isError,
    source: resolved.data?.data.source,
    sourceName: resolved.data?.data.sourceCategoryName,
  };
}
