"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  CategoryForm,
  categoryFormValuesToDto,
  type CategoryFormInput,
  type CategoryFormValues,
} from "@/features/category-form";
import { AttributeDefinitionEditor } from "@/features/attribute-definition-editor";
import { CategoryDeleteAction } from "@/features/category-delete";
import {
  CategoryAddonTemplatePicker,
  useCategoryAddonTemplate,
} from "@/features/category-addon-template-picker";
import {
  AdminFormSkeleton,
  Badge,
  RowActionsMenu,
  useConfirmDialog,
} from "@/shared/ui";
import { formatKeywords } from "@/shared/lib/seo";
import { descendantsOf } from "@/shared/lib/sortable-tree";
import {
  flattenAdminCategoryTree,
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getAdminCategoryControllerFindByIdQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
  useAdminCategoryControllerFindById,
  useAdminCategoryControllerUpdate,
  useCategoryControllerGetAdminTree,
} from "@/entities/category";
import { dict, STOREFRONT_URL } from "@/shared/config";

const f = dict.categoryForm;
const tree = dict.categories.tree;

const SECTION_ATTRIBUTES = "category-section-attributes";
const SECTION_ADDONS = "category-section-addons";

interface EditCategoryViewProps {
  categoryId: string;
}

/**
 * Edit-category page (CategoriesProposal КТ5, wave 198).
 *
 * Header: «← Категорії», the name, the SITE status («Показується / Приховано»,
 * «через батьківську» when an ancestor hides it), the counts and the public
 * address, and «⋯». Body: one sectioned form with ONE sticky «Зберегти».
 *
 * The save runs the sections in a FIXED order and stops at the first that
 * fails, saying what did save:
 *   1. the category itself (Основне, Зображення, SEO — one PUT);
 *   2. the add-on services template, only when it was changed.
 * Characteristics are not in that list on purpose: each of their writes goes
 * to its own endpoint at once (as before), so there is nothing to hold back.
 *
 * A missing category (404) redirects back to the list.
 */
export function EditCategoryView({ categoryId }: EditCategoryViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, error } =
    useAdminCategoryControllerFindById(categoryId);
  const update = useAdminCategoryControllerUpdate();
  const { mutateAsync: updateAsync } = update;
  const addonTemplate = useCategoryAddonTemplate(categoryId);

  // The header's counts and the «через батьківську» note come from the tree
  // already cached for the form's parent select — no extra request.
  const treeQuery = useCategoryControllerGetAdminTree();
  const treeItems = useMemo(
    () => flattenAdminCategoryTree(treeQuery.data?.data),
    [treeQuery.data],
  );
  const facts = useMemo(() => {
    const self = treeItems.find((item) => item.id === categoryId);
    if (!self) return null;
    const byId = new Map(treeItems.map((item) => [item.id, item]));
    let hiddenByParent = false;
    const seen = new Set<string>([self.id]);
    let parentId = self.parentId;
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (parent && !parent.isActive) {
        hiddenByParent = true;
        break;
      }
      parentId = parent?.parentId ?? null;
    }
    return {
      products: self.subtreeProductCount,
      subcategories: descendantsOf(treeItems, self.id).size,
      hiddenByParent,
    };
  }, [categoryId, treeItems]);

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/categories");
    }
  }, [isNotFound, router]);

  const category = data?.data;

  const handleSubmit = async (values: CategoryFormValues) => {
    // TASK-285: renaming an ACTIVE category's slug kills its indexed URL — warn
    // first. A blank slug means "auto-generate" (treated as no rename here).
    const nextSlug = values.slug?.trim();
    const wasLive = category?.isActive === true;
    if (wasLive && category && nextSlug && nextSlug !== category.slug) {
      const confirmed = await confirm({
        title: dict.categories.slugChangeConfirmTitle,
        description: dict.categories.slugChangeConfirm(category.slug, nextSlug),
        confirmLabel: dict.categories.slugChangeConfirmAction,
      });
      if (!confirmed) return false;
    }

    setSaving(true);
    try {
      // 1. The category itself.
      try {
        await updateAsync({
          id: categoryId,
          data: categoryFormValuesToDto(values, { isUpdate: true }),
        });
      } catch {
        toast.error(dict.categories.saveStepFailed("", f.sectionMain));
        return false;
      }
      void queryClient.invalidateQueries({
        queryKey: getAdminCategoryControllerFindAllWithProductCountQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: getAdminCategoryControllerFindByIdQueryKey(categoryId),
      });
      // §3.11: the treegrid reads the admin-tree query, which nothing
      // invalidated before TASK-291 — a rename or a parent change made through
      // the kept <Select> would leave the tree stale until reload.
      void queryClient.invalidateQueries({
        queryKey: getCategoryControllerGetAdminTreeQueryKey(),
      });

      // 2. The add-on services, only when they were changed.
      if (addonTemplate.isDirty) {
        try {
          await addonTemplate.save();
        } catch {
          toast.error(
            dict.categories.saveStepFailed(f.sectionMain, f.sectionAddons),
          );
          // The category DID save — its form takes the new baseline.
          return true;
        }
      }

      toast.success(dict.categories.toastUpdated);
      router.push("/categories");
      return true;
    } finally {
      setSaving(false);
    }
  };

  const shown = category ? category.isActive && !facts?.hiddenByParent : false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/categories"
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.categories.back}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {category?.name ?? dict.categories.editHeading}
            </h2>
            {category ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Badge variant={shown ? "default" : "secondary"}>
                  {shown ? tree.statusShown : tree.statusHidden}
                </Badge>
                {category.isActive && facts?.hiddenByParent ? (
                  <span className="font-medium text-warning">
                    {tree.hiddenByParent}
                  </span>
                ) : null}
                {facts ? (
                  <p>
                    {`${dict.categories.headerProducts(facts.products, facts.subcategories)} · /categories/${category.slug}`}
                  </p>
                ) : (
                  <p>{`/categories/${category.slug}`}</p>
                )}
              </div>
            ) : null}
          </div>
          {category ? (
            <div className="flex shrink-0 items-center gap-2">
              <RowActionsMenu
                label={dict.categories.headerMenuAria}
                className="size-9 border"
                items={[
                  {
                    label: dict.categories.openOnSite,
                    href: `${STOREFRONT_URL}/categories/${category.slug}`,
                    newTab: true,
                  },
                ]}
              />
              {/* ДН-2.12: the destructive action last, outlined in red, and
                  only for a session holding `categories:delete`. */}
              <CategoryDeleteAction
                categoryId={categoryId}
                onDeleted={() => router.push("/categories")}
              />
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <AdminFormSkeleton />
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.categories.loadOneError}
        </p>
      ) : category ? (
        <CategoryForm
          id={categoryId}
          defaultValues={mapCategoryToFormValues(category)}
          excludeParentId={categoryId}
          onSubmit={handleSubmit}
          isPending={saving}
          submitLabel={dict.common.save}
          extraSections={[
            {
              id: SECTION_ATTRIBUTES,
              label: f.sectionAttributes,
              // Structured-spec templates (TASK-191): saved row by row, at once.
              node: (
                <AttributeDefinitionEditor
                  categoryId={categoryId}
                  id={SECTION_ATTRIBUTES}
                />
              ),
            },
            {
              id: SECTION_ADDONS,
              label: f.sectionAddons,
              // Add-on template (TASK-174): saved by the form's «Зберегти».
              node: (
                <CategoryAddonTemplatePicker
                  template={addonTemplate}
                  id={SECTION_ADDONS}
                />
              ),
            },
          ]}
          extraDirtySections={addonTemplate.isDirty ? [f.sectionAddons] : []}
          onDiscardExtra={addonTemplate.discard}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

/** Map a fetched category entity onto the form's string-based input shape. */
function mapCategoryToFormValues(category: {
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  isActive: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  ogImage?: string | null;
}): Partial<CategoryFormInput> {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    image: category.image ?? "",
    parentId: category.parentId ?? "",
    isActive: category.isActive,
    metaTitle: category.metaTitle ?? "",
    metaDescription: category.metaDescription ?? "",
    keywords: formatKeywords(category.keywords),
    ogImage: category.ogImage ?? "",
  };
}
