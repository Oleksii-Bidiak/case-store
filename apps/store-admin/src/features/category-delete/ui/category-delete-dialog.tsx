"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  Controller,
  useForm,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  GalleryHorizontalEndIcon,
  LinkIcon,
  Loader2Icon,
  PackageIcon,
  Trash2Icon,
} from "lucide-react";
import {
  flattenAdminCategoryTree,
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getAdminCategoryControllerFindByIdQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
  useAdminCategoryControllerDelete,
  useAdminCategoryControllerFindById,
  useCategoryControllerGetAdminTree,
  type CategoryDeletionImpactEntity,
  type CategoryDeletionResultEntity,
  type CategoryTreeItem,
} from "@/entities/category";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { MAX_TREE_LEVELS, descendantsOf } from "@/shared/lib/sortable-tree";
import { apiErrorStatus, slugify } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Callout,
  ErrorState,
  FieldError,
  FormAlert,
  Input,
  Label,
  SegmentedControl,
  Skeleton,
  TreeCombobox,
  treeComboboxItems,
} from "@/shared/ui";
import { toast, UNDO_TOAST_DURATION_MS } from "@/shared/ui/toast";
import { dict } from "@/shared/config";
import {
  CATEGORY_DELETE_DEFAULTS,
  NEW_NAME_MAX_LENGTH,
  makeCategoryDeleteSchema,
  toDeleteCategoryDto,
  type CategoryDeleteFormValues,
  type DeleteMode,
} from "../model/delete-schema";
import {
  deletionErrorIsHiddenTarget,
  deletionErrorIsStale,
  deletionErrorMessage,
} from "../model/deletion-error";

const d = dict.categories.delete;

/** How many subcategory names the «зникне» row spells out before «і ще N». */
const NAMED_SUBCATEGORIES = 5;
/** How many carousel names the carousels row spells out (TASK-1776). */
const NAMED_CAROUSELS = 3;

export interface CategoryDeleteDialogProps {
  /** The category to delete; `null` closes the dialog. */
  categoryId: string | null;
  onOpenChange: (open: boolean) => void;
  /**
   * Ran after the server confirmed the delete and the caches were refreshed.
   * The tree stays put (the branch disappears on refetch); the category card
   * navigates back to `/categories`, because what it showed no longer exists.
   */
  onDeleted?: () => void;
}

/**
 * «Видалити категорію» (TASK-655, CategoryDelete.dc.html ДН-2.2…2.10).
 *
 * A category is never deleted alone and its products are never deleted at all
 * (decision B-2 of plan 178): the whole branch is tombstoned and every product
 * in it moves to ONE target outside the branch, in one transaction. So the
 * dialog first asks WHERE, then states — before the click and from the
 * server's own `deletionImpact` — what disappears, what moves and what switches.
 *
 * `role="alertdialog"` (Radix AlertDialog): no close on an outside click, the
 * first focus lands on «Скасувати». Below `md` it fills the screen (ДН-2.10).
 *
 * The permission gate is UI-only: without `categories:delete` there is no
 * dialog at all, so nobody is handed a button whose only result is a 403.
 * `PermissionGuard` on the route is the real boundary.
 */
export function CategoryDeleteDialog({
  categoryId,
  onOpenChange,
  onDeleted,
}: CategoryDeleteDialogProps) {
  const { can } = useAuth();
  if (!can(PERM.categoriesDelete)) return null;

  const open = categoryId !== null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* The content — and the form in it — exists only while the dialog is
          open (forms.md, the `review-reply-action.tsx` pattern): closing
          disposes the operator's half-made choice, so the next open starts
          from the server again instead of from an abandoned draft. */}
      {open ? (
        <CategoryDeleteContent
          categoryId={categoryId}
          onClose={() => onOpenChange(false)}
          onDeleted={onDeleted}
        />
      ) : null}
    </AlertDialog>
  );
}

/* ───────────────────────────── the content ───────────────────────────── */

function CategoryDeleteContent({
  categoryId,
  onClose,
  onDeleted,
}: {
  categoryId: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  // The preview must be TODAY's numbers, not a five-minute-old cache from the
  // card the operator came from: what is about to move is the whole point.
  const detail = useAdminCategoryControllerFindById(categoryId, {
    query: { staleTime: 0, refetchOnMount: "always" },
  });
  const treeQuery = useCategoryControllerGetAdminTree();
  const items = useMemo(
    () => flattenAdminCategoryTree(treeQuery.data?.data),
    [treeQuery.data],
  );
  const remove = useAdminCategoryControllerDelete();
  const contentId = useId();

  const category = detail.data?.data;
  const impact = category?.deletionImpact;
  const name = category?.name ?? items.find((i) => i.id === categoryId)?.label;
  const gone = apiErrorStatus(detail.error) === 404;

  const isEmpty = impact ? isEmptyBranch(impact) : false;
  const busy = remove.isPending;
  const formId = `${contentId}-form`;
  const lead = !impact
    ? d.leadUnknown
    : isEmpty
      ? d.leadEmpty
      : impact.subcategoryCount > 0
        ? d.lead
        : d.leadLeaf;

  return (
    <AlertDialogContent
      className={cn(
        "md:max-w-150",
        // ДН-2.10: on a phone the dialog is the screen, with the same 1rem
        // gutter the plain Dialog keeps below `md`.
        "max-md:inset-4 max-md:w-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:content-start max-md:overflow-y-auto",
      )}
      // A delete in flight cannot be walked away from half-way: Escape waits.
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle className="leading-snug">
          {d.title(name ?? "")}
        </AlertDialogTitle>
        <AlertDialogDescription>{lead}</AlertDialogDescription>
      </AlertDialogHeader>

      {impact && category ? (
        <CategoryDeleteForm
          formId={formId}
          categoryId={categoryId}
          name={category.name}
          slug={category.slug}
          impact={impact}
          items={items}
          treeLoading={treeQuery.isLoading}
          // Only a failure with nothing cached is a dead end: a failed
          // background refetch still leaves the last good tree to pick from.
          treeFailed={treeQuery.isError && !treeQuery.data}
          treeRetrying={treeQuery.isFetching}
          onRetryTree={() => void treeQuery.refetch()}
          remove={remove}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      ) : detail.isError ? (
        // Never zeros-as-facts: without the server's numbers there is no form.
        <FormAlert>{gone ? d.goneError : d.loadError}</FormAlert>
      ) : (
        <div aria-busy="true" className="flex flex-col gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            {d.loading}
          </p>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {/* ONE footer for every state: «Скасувати» is where the alertdialog
          puts the first focus, and it must not be unmounted from under that
          focus when the numbers arrive. The confirm button joins the form
          through `form=`, so it can live here. */}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy} className="max-md:h-11">
          {dict.common.cancel}
        </AlertDialogCancel>
        {impact && category ? (
          <Button
            type="submit"
            form={formId}
            variant="destructive"
            disabled={busy}
            // ДН-2.7: in flight the button stays red with a white spinner —
            // the grey «disabled» look would read as «not allowed», while
            // this is «already doing it». It is disabled only while busy.
            className="max-md:h-11 disabled:bg-destructive disabled:text-white"
          >
            {busy ? (
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {busy
              ? d.busy
              : !isEmpty && impact.productCount > 0
                ? d.confirmMove(impact.productCount)
                : d.confirm}
          </Button>
        ) : detail.isError && !gone ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            onClick={() => void detail.refetch()}
          >
            {d.retry}
          </Button>
        ) : null}
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

/** ДН-2.9: nothing to move, nothing below, nothing pointing at it. */
function isEmptyBranch(impact: CategoryDeletionImpactEntity): boolean {
  return (
    impact.subcategoryCount === 0 &&
    impact.productCount === 0 &&
    impact.carouselCount === 0 &&
    // Soft-deleted products block a target-less delete too (TASK-655): the
    // server would refuse with CATEGORY_MOVE_TARGET_REQUIRED.
    impact.deletedProductCount === 0
  );
}

/**
 * Drop the cached detail of every deleted category, so going back to its card
 * (the 5-minute `staleTime`) does not paint a category that no longer exists.
 *
 * NOT while something still watches it. At this moment the dialog's own
 * preview and — when deleting from the card — the card itself are mounted;
 * removing a query under a live observer makes it fetch again, and that
 * fetch is a 404 racing the navigation away. Such a query is dropped the
 * moment its last observer leaves instead.
 */
function forgetDeletedCategories(
  queryClient: QueryClient,
  ids: Iterable<string>,
) {
  const cache = queryClient.getQueryCache();
  for (const id of ids) {
    const queryKey = getAdminCategoryControllerFindByIdQueryKey(id);
    for (const query of cache.findAll({ queryKey })) {
      if (query.getObserversCount() === 0) {
        cache.remove(query);
        continue;
      }
      const unsubscribe = cache.subscribe((event) => {
        if (event.query !== query) return;
        if (event.type === "removed") {
          unsubscribe();
        } else if (
          event.type === "observerRemoved" &&
          query.getObserversCount() === 0
        ) {
          unsubscribe();
          cache.remove(query);
        }
      });
    }
  }
}

/* ─────────────────────────────── the form ─────────────────────────────── */

interface CategoryDeleteFormProps {
  /** The footer's confirm button submits this form through `form=`. */
  formId: string;
  categoryId: string;
  name: string;
  slug: string;
  impact: CategoryDeletionImpactEntity;
  items: CategoryTreeItem[];
  treeLoading: boolean;
  /** The tree read failed and nothing is cached — no target can be offered. */
  treeFailed: boolean;
  treeRetrying: boolean;
  onRetryTree: () => void;
  remove: ReturnType<typeof useAdminCategoryControllerDelete>;
  onClose: () => void;
  onDeleted?: () => void;
}

function CategoryDeleteForm({
  formId,
  categoryId,
  name,
  slug,
  impact,
  items,
  treeLoading,
  treeFailed,
  treeRetrying,
  onRetryTree,
  remove,
  onClose,
  onDeleted,
}: CategoryDeleteFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canCreate = can(PERM.categoriesWrite);
  const baseId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  /**
   * TASK-1837: the API refused `id` as HIDDEN while the tree in hand (`items`)
   * still showed it as shown. Until the re-read tree arrives the server's word
   * stands, so the warning — and with it the consent — is there at once; once
   * `items` is a new array, the fresh tree speaks for itself.
   */
  const [refusedHidden, setRefusedHidden] = useState<{
    id: string;
    items: CategoryTreeItem[];
  } | null>(null);

  const isEmpty = isEmptyBranch(impact);
  const schema = useMemo(() => makeCategoryDeleteSchema(isEmpty), [isEmpty]);
  const { control, register, handleSubmit, setFocus, clearErrors, formState } =
    useForm<CategoryDeleteFormValues>({
      // Default `onSubmit` mode (forms.md Rule 4a): nothing is said before the
      // first press of the button.
      resolver: zodResolver(schema),
      defaultValues: CATEGORY_DELETE_DEFAULTS,
    });
  const errors = formState.errors;
  const [mode, targetId, newName, parentId] = useWatch({
    control,
    name: ["mode", "targetId", "name", "parentId"],
  });

  /* ── the tree, minus the branch being deleted ───────────────────────── */

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const descendants = useMemo(
    () => descendantsOf(items, categoryId),
    [categoryId, items],
  );
  const doomed = useMemo(
    () => new Set([categoryId, ...descendants]),
    [categoryId, descendants],
  );
  const pickerItems = useMemo(() => {
    const nested = flattenNested(items);
    return treeComboboxItems(nested).filter((i) => !doomed.has(i.value));
  }, [doomed, items]);
  /**
   * Is this category itself hidden (TASK-1837)? Its OWN flag only: a product
   * is on the site while its own category is shown, whatever the ancestors
   * say — exactly the rule the API checks for a move target.
   */
  const isHidden = (id: string) =>
    byId.get(id)?.isActive === false ||
    (refusedHidden?.id === id && refusedHidden.items === items);
  // ДН-2.3: each target says how many products it already holds, so the
  // operator sees where the moved ones will land among. A hidden one stays
  // selectable but says so (TASK-1837) — the tree's «Приховано» in short.
  const targetItems = useMemo(
    () =>
      pickerItems.map((i) => {
        const node = byId.get(i.value);
        const count = node?.subtreeProductCount ?? 0;
        return {
          ...i,
          meta:
            node?.isActive === false
              ? d.targetOptionHidden(count)
              : d.targetOptionCount(count),
        };
      }),
    [byId, pickerItems],
  );
  // A new category is created ONE level below its parent, so a parent already
  // at the structural cap would be refused by the tree rules — never offered.
  const parentItems = useMemo(
    () =>
      pickerItems
        .filter((i) => (byId.get(i.value)?.depth ?? 1) < MAX_TREE_LEVELS)
        .map((i) =>
          byId.get(i.value)?.isActive === false
            ? { ...i, meta: d.parentOptionHidden }
            : i,
        ),
    [byId, pickerItems],
  );

  /* ── where the products go, as a phrase ─────────────────────────────── */

  const trimmedName = newName.trim();
  const target: string | null =
    mode === "existing"
      ? targetId && byId.has(targetId)
        ? d.targetExisting(byId.get(targetId)!.label)
        : null
      : trimmedName
        ? parentId && byId.has(parentId)
          ? d.targetNewUnder(trimmedName, byId.get(parentId)!.label)
          : d.targetNewRoot(trimmedName)
        : null;

  const subcategoryNames = items
    .filter((i) => descendants.has(i.id))
    .map((i) => i.label);

  // TASK-1837: the picked existing target is hidden — the moved products leave
  // the site. The warning below says so, and ONLY then does the request carry
  // `allowHiddenTarget` (computed in the same render the operator confirms).
  const hiddenTargetName =
    mode === "existing" && targetId && byId.has(targetId) && isHidden(targetId)
      ? byId.get(targetId)!.label
      : null;
  // A new category under a hidden parent (or ancestor) is created shown and
  // its products stay on the site — only the menu will not lead to it.
  const hiddenParentName =
    mode === "new" && parentId ? nearestHidden(byId, parentId) : null;

  /* ── submit ─────────────────────────────────────────────────────────── */

  const busy = remove.isPending;

  const onValid = (values: CategoryDeleteFormValues) => {
    setServerError(null);
    const body = toDeleteCategoryDto(values, isEmpty, {
      // `hiddenTargetName` is what this render shows for THIS target — the
      // consent is given only for a warning the operator has seen.
      allowHiddenTarget:
        !isEmpty &&
        values.mode === "existing" &&
        values.targetId === targetId &&
        hiddenTargetName !== null,
    });
    const requestMode = isEmpty ? "none" : values.mode;
    const newSlug = slugify(values.name.trim());
    const movedTo =
      values.mode === "existing"
        ? (byId.get(values.targetId)?.label ?? "")
        : values.name.trim();

    remove.mutate(
      { id: categoryId, data: body },
      {
        onSuccess: (response) => {
          // TASK-1775: the server says what it DID — the target's id (also of
          // a category created here) and the real counts, which may differ
          // from the preview if products arrived in between.
          const result = response.data;
          const resultTargetId = result.targetId ?? body.moveToId ?? null;
          void queryClient.invalidateQueries({
            queryKey: getCategoryControllerGetAdminTreeQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey:
              getAdminCategoryControllerFindAllWithProductCountQueryKey(),
          });
          if (resultTargetId) {
            // The target's card shows counts and its own deletion preview.
            void queryClient.invalidateQueries({
              queryKey:
                getAdminCategoryControllerFindByIdQueryKey(resultTargetId),
            });
          }
          // The products did not change — their category did, and the list
          // shows it in a column and filters by it.
          void queryClient.invalidateQueries({
            queryKey: getProductControllerAdminFindAllQueryKey(),
          });

          toastResult({
            name,
            target: movedTo,
            result,
            targetId: resultTargetId,
            // Only live products were in the preview's «N товарів»: when it
            // had none and no more moved than the soft-deleted ones it named,
            // only those moved (TASK-1836) — and the product list does not
            // show them, so no «Показати товари».
            deletedOnly:
              impact.productCount === 0 &&
              result.movedProducts <= impact.deletedProductCount,
          });

          onClose();
          onDeleted?.();
          // What was deleted no longer resolves; a cached card must not
          // render it again on the way back in.
          forgetDeletedCategories(queryClient, doomed);
        },
        onError: (error) => {
          // The choice stays exactly as it was — only the box appears.
          setServerError(
            deletionErrorMessage(error, {
              mode: requestMode,
              slug: newSlug,
              target: movedTo,
            }),
          );
          if (body.moveToId && deletionErrorIsHiddenTarget(error)) {
            // The warning shows at once; the tree re-read below confirms it.
            setRefusedHidden({ id: body.moveToId, items });
          }
          if (deletionErrorIsStale(error)) {
            void queryClient.invalidateQueries({
              queryKey: getCategoryControllerGetAdminTreeQueryKey(),
            });
            void queryClient.invalidateQueries({
              queryKey: getAdminCategoryControllerFindByIdQueryKey(categoryId),
            });
          }
        },
      },
    );
  };

  /**
   * ДН-2.11, from the server's answer (TASK-1775). «Показати товари» opens
   * the product list filtered by the target — its id comes back in the
   * answer, also for a category created in this dialog.
   */
  const toastResult = ({
    name: deletedName,
    target,
    result,
    targetId: resultTargetId,
    deletedOnly,
  }: {
    name: string;
    target: string;
    result: CategoryDeletionResultEntity;
    targetId: string | null;
    deletedOnly: boolean;
  }) => {
    const moved = result.movedProducts;
    if (moved > 0 && !deletedOnly) {
      toast.success(d.toastMoved(deletedName, moved, target), {
        duration: UNDO_TOAST_DURATION_MS,
        ...(resultTargetId
          ? {
              action: {
                label: d.toastShowProducts,
                onClick: () => {
                  router.push(
                    `/products?categoryId=${encodeURIComponent(resultTargetId)}`,
                  );
                },
              },
            }
          : {}),
      });
      return;
    }
    if (moved > 0) {
      toast.success(d.toastMovedDeleted(deletedName, moved, target));
    } else {
      toast.success(d.toastDone(deletedName));
    }
  };

  const targetInputId = `${baseId}-target`;
  const nameInputId = `${baseId}-name`;

  /** forms.md Rule 4a: a blocked submit moves focus to what blocks it. */
  const onInvalid = (invalid: FieldErrors<CategoryDeleteFormValues>) => {
    if (invalid.targetId) {
      document.getElementById(targetInputId)?.focus();
    } else if (invalid.name) {
      setFocus("name");
    }
  };

  /* ── render ─────────────────────────────────────────────────────────── */

  const modeHintId = `${baseId}-mode-hint`;
  const targetHintId = `${baseId}-target-hint`;
  const targetErrorId = `${baseId}-target-error`;
  const nameHintId = `${baseId}-name-hint`;
  const nameErrorId = `${baseId}-name-error`;
  const parentInputId = `${baseId}-parent`;
  const parentHintId = `${baseId}-parent-hint`;
  const consequencesId = `${baseId}-consequences`;
  const hasChildren = impact.subcategoryCount > 0;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={handleSubmit(onValid, onInvalid)}
      className="flex flex-col gap-4"
      aria-busy={busy}
    >
      {isEmpty ? null : (
        <fieldset
          disabled={busy}
          className="flex min-w-0 flex-col gap-3 disabled:opacity-60"
        >
          <legend className="mb-2 text-sm font-medium text-foreground">
            {d.modeLabel}
          </legend>
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <SegmentedControl<DeleteMode>
                aria-label={d.modeLabel}
                variant="pill"
                value={field.value}
                onValueChange={(next) => {
                  // The other mode's message would otherwise linger under a
                  // field that is no longer on screen.
                  clearErrors();
                  field.onChange(next);
                }}
                options={[
                  { value: "existing", label: d.modeExisting },
                  {
                    value: "new",
                    label: d.modeNew,
                    disabled: !canCreate,
                    describedBy: canCreate ? undefined : modeHintId,
                  },
                ]}
              />
            )}
          />
          {canCreate ? null : (
            <p id={modeHintId} className="text-xs text-muted-foreground">
              {d.modeNewLocked}
            </p>
          )}

          {treeFailed ? (
            // Never an empty picker answering «Такої категорії немає»: the
            // list is not empty, it did not arrive.
            <ErrorState
              message={d.treeLoadError}
              onRetry={onRetryTree}
              isRetrying={treeRetrying}
            />
          ) : null}

          {mode === "existing" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={targetInputId} className="sr-only">
                {d.targetLabel}
              </Label>
              <Controller
                control={control}
                name="targetId"
                render={({ field }) => (
                  <TreeCombobox
                    id={targetInputId}
                    items={targetItems}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={d.targetPlaceholder}
                    emptyText={d.targetEmpty}
                    isLoading={treeLoading}
                    disabled={busy || treeFailed}
                    showSelectedPath
                    aria-invalid={errors.targetId ? true : undefined}
                    aria-describedby={
                      errors.targetId
                        ? `${targetHintId} ${targetErrorId}`
                        : targetHintId
                    }
                  />
                )}
              />
              <FieldError id={targetErrorId}>
                {errors.targetId?.message}
              </FieldError>
              <p id={targetHintId} className="text-xs text-muted-foreground">
                {d.targetExcluded(name, hasChildren)}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={nameInputId} required>
                  {d.newName}
                </Label>
                {/* No `key`: the field keeps its node — and the caret — for
                    the life of the dialog (forms.md). */}
                <Input
                  id={nameInputId}
                  autoComplete="off"
                  maxLength={NEW_NAME_MAX_LENGTH}
                  aria-required="true"
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={
                    errors.name ? `${nameHintId} ${nameErrorId}` : nameHintId
                  }
                  {...register("name")}
                />
                <FieldError id={nameErrorId}>{errors.name?.message}</FieldError>
                <p id={nameHintId} className="text-xs text-muted-foreground">
                  {d.newNameHint(slugify(trimmedName))}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={parentInputId}>{d.newParent}</Label>
                <Controller
                  control={control}
                  name="parentId"
                  render={({ field }) => (
                    <TreeCombobox
                      id={parentInputId}
                      items={parentItems}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={d.newParentRoot}
                      clearLabel={d.newParentRoot}
                      emptyText={d.targetEmpty}
                      isLoading={treeLoading}
                      // Without the tree the root is the only known-legal
                      // parent — it stays, nothing else is offered.
                      disabled={busy || treeFailed}
                      showSelectedPath
                      aria-describedby={parentHintId}
                    />
                  )}
                />
                <p id={parentHintId} className="text-xs text-muted-foreground">
                  {d.newParentHint(name)}
                </p>
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <p
          id={consequencesId}
          className="text-xs font-medium text-muted-foreground"
        >
          {d.consequences}
        </p>
        <ul
          aria-labelledby={consequencesId}
          className="flex flex-col rounded-md border border-border"
        >
          <ConsequenceRow
            tone="danger"
            icon={<Trash2Icon />}
            count={d.goneCount(1 + impact.subcategoryCount)}
            text={d.goneText(
              1 + impact.subcategoryCount,
              name,
              impact.subcategoryCount,
            )}
            sub={
              isEmpty
                ? d.goneSubEmpty
                : hasChildren && subcategoryNames.length > 0
                  ? d.goneSubNames(
                      subcategoryNames
                        .slice(0, NAMED_SUBCATEGORIES)
                        .join(" · "),
                      Math.max(
                        0,
                        impact.subcategoryCount -
                          Math.min(
                            subcategoryNames.length,
                            NAMED_SUBCATEGORIES,
                          ),
                      ),
                    )
                  : d.goneSubOne
            }
          />
          {/* ДН-2.2: until the target is known only the loss is certain —
              where things go is not a fact yet, so it is not shown. */}
          {!isEmpty && target !== null ? (
            <>
              {impact.productCount > 0 ? (
                <ConsequenceRow
                  // TASK-1837: «не ховається» would be false for a hidden target.
                  tone={hiddenTargetName !== null ? "warning" : "neutral"}
                  icon={<PackageIcon />}
                  count={d.productsCount(impact.productCount)}
                  text={d.productsText(impact.productCount, target)}
                  sub={[
                    hiddenTargetName !== null
                      ? d.productsSubHidden
                      : d.productsSub,
                    impact.deletedProductCount > 0
                      ? d.productsDeletedToo(impact.deletedProductCount)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ) : impact.deletedProductCount > 0 ? (
                <ConsequenceRow
                  icon={<PackageIcon />}
                  count={d.deletedOnlyCount(impact.deletedProductCount)}
                  text={d.productsText(impact.deletedProductCount, target)}
                  sub={d.deletedOnlySub}
                />
              ) : null}
              {impact.carouselCount > 0 ? (
                <ConsequenceRow
                  icon={<GalleryHorizontalEndIcon />}
                  count={d.carouselsCount(impact.carouselCount)}
                  text={d.carouselsText(
                    impact.carouselCount,
                    impact.carousels
                      .slice(0, NAMED_CAROUSELS)
                      .map((c) => c.name),
                    target,
                  )}
                  sub={d.carouselsSub(impact.carouselCount)}
                />
              ) : null}
            </>
          ) : null}
          {isEmpty || target !== null ? (
            <ConsequenceRow
              icon={<LinkIcon />}
              count={d.address}
              text={d.addressText(slug)}
              sub={isEmpty ? d.addressSubEmpty : d.addressSub}
            />
          ) : null}
        </ul>
      </div>

      {!isEmpty && hiddenTargetName !== null ? (
        <Callout variant="warning">
          {d.hiddenTargetWarning(hiddenTargetName, impact.productCount)}
        </Callout>
      ) : null}

      {!isEmpty && hiddenParentName !== null ? (
        <Callout variant="muted">
          {d.newParentHiddenNote(hiddenParentName)}
        </Callout>
      ) : null}

      {!isEmpty && target !== null ? (
        <Callout variant="warning">{d.templatesWarning(target)}</Callout>
      ) : null}

      <FormAlert title={d.errorTitle}>{serverError}</FormAlert>
    </form>
  );
}

/** One line of «Що станеться»: a bold count, what happens, and why. */
function ConsequenceRow({
  tone = "neutral",
  icon,
  count,
  text,
  sub,
}: {
  tone?: "neutral" | "danger" | "warning";
  icon: ReactNode;
  count: string;
  text: string;
  sub: string;
}) {
  return (
    <li
      data-tone={tone}
      className="flex items-start gap-2.5 border-t border-border px-3 py-2.5 text-sm text-foreground first:border-t-0"
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 shrink-0 [&_svg]:size-4",
          tone === "danger"
            ? "text-destructive"
            : tone === "warning"
              ? "text-warning"
              : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="font-semibold tabular-nums">{count}</span> {text}
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </li>
  );
}

/**
 * The name of `id` or of its nearest ancestor that is hidden (TASK-1837), or
 * `null` when the whole chain is shown. A category under a hidden ancestor is
 * unreachable from the storefront menu even while its own flag is on.
 */
function nearestHidden(
  byId: Map<string, CategoryTreeItem>,
  id: string,
): string | null {
  const seen = new Set<string>();
  let node = byId.get(id);
  while (node && !seen.has(node.id)) {
    if (!node.isActive) return node.label;
    seen.add(node.id);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return null;
}

/**
 * Rebuild the nested shape `treeComboboxItems` walks from the flat, ordered
 * tree (array order within a parent IS sibling order), so the picker and the
 * subtree exclusion read the SAME `flattenAdminCategoryTree` result.
 */
function flattenNested(items: CategoryTreeItem[]) {
  interface Node {
    id: string;
    name: string;
    children: Node[];
  }
  const nodes = new Map<string, Node>(
    items.map((i) => [i.id, { id: i.id, name: i.label, children: [] }]),
  );
  const roots: Node[] = [];
  for (const item of items) {
    const node = nodes.get(item.id)!;
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
