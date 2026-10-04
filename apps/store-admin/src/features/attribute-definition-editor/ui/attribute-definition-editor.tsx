"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  RowActionsMenu,
  SortableTree,
  useConfirmDialog,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { countLabel } from "@/shared/lib/plural";
import { dict } from "@/shared/config";
import {
  AttributeDefinitionEntityType,
  useAttributeDefinitionControllerFindByCategory,
  useAttributeDefinitionControllerCreate,
  useAttributeDefinitionControllerUpdate,
  useAttributeDefinitionControllerDelete,
  useAttributeDefinitionControllerReorder,
  getAttributeDefinitionControllerFindByCategoryQueryKey,
  getAttributeDefinitionControllerFindEffectiveQueryKey,
  getAttributeDefinitionControllerFacetCeilingQueryKey,
  type AttributeDefinitionEntity,
} from "@/entities/attribute-definition";
import { AttributeDefinitionForm } from "./attribute-definition-form";
import { FacetCeilingNotice, FacetCountInline } from "./facet-ceiling-notice";
import {
  formValuesToDto,
  type AttributeDefinitionFormValues,
} from "../model/attribute-definition-schema";

const d = dict.attributeDefinitions;

/**
 * The type in the operator's words (wave 198, КТ5): «Вибір зі списку · 12
 * варіантів», «Так / Ні», «Текст · не може бути фільтром» — never the enum.
 */
export function attributeTypeLine(definition: AttributeDefinitionEntity) {
  const parts: string[] = [];
  switch (definition.type) {
    case AttributeDefinitionEntityType.SELECT:
      parts.push(
        d.typeSelect,
        countLabel(definition.options.length, d.optionForms),
      );
      break;
    case AttributeDefinitionEntityType.BOOLEAN:
      parts.push(d.typeBoolean);
      break;
    case AttributeDefinitionEntityType.NUMBER:
      parts.push(d.typeNumberLine);
      break;
    default:
      parts.push(d.typeTextLine);
  }
  if (definition.unit) parts.push(definition.unit);
  return parts.join(" · ");
}

interface AttributeDefinitionEditorProps {
  categoryId: string;
  /** The section's id — the anchor of the category form's section index. */
  id?: string;
}

/**
 * Category-scoped structured-spec template editor (TASK-191), a section of the
 * category form since wave 198 (CategoriesProposal КТ5).
 *
 * Lists the category's OWN definitions (not inherited ones). Every write here
 * — add, edit, delete, reorder — goes to its own endpoint IMMEDIATELY, as it
 * always has; that is why this section never appears in the form's «Незбережені
 * зміни» line and the form's «Зберегти» does not touch it.
 *
 * Order: drag a row by ⠿ (pointer), or «Вгору / Вниз» in the row's «⋯» — the
 * keyboard and touch path, and the WCAG 2.5.7 non-dragging alternative. Both
 * send the same `orderedIds` to the reorder endpoint.
 */
export function AttributeDefinitionEditor({
  categoryId,
  id,
}: AttributeDefinitionEditorProps) {
  const queryClient = useQueryClient();
  const headingId = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AttributeDefinitionEntity | null>(
    null,
  );
  /** A dropped order, shown while its PATCH is in flight and the list refetches. */
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const listQuery = useAttributeDefinitionControllerFindByCategory(categoryId);
  const serverDefinitions = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data],
  );
  const definitions = useMemo(() => {
    if (!pendingOrder) return serverDefinitions;
    const byId = new Map(serverDefinitions.map((def) => [def.id, def]));
    const ordered = pendingOrder
      .map((defId) => byId.get(defId))
      .filter((def): def is AttributeDefinitionEntity => def !== undefined);
    return ordered.length === serverDefinitions.length
      ? ordered
      : serverDefinitions;
  }, [pendingOrder, serverDefinitions]);

  const createMutation = useAttributeDefinitionControllerCreate();
  const updateMutation = useAttributeDefinitionControllerUpdate();
  const deleteMutation = useAttributeDefinitionControllerDelete();
  const reorderMutation = useAttributeDefinitionControllerReorder();

  // Every write here can move a category across the facet ceiling (TASK-707):
  // ticking «фільтр», deleting, and reordering (which changes WHICH facets are
  // past it) — so the notice and the «зараз N з 6» count are refetched too.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey:
          getAttributeDefinitionControllerFindByCategoryQueryKey(categoryId),
      }),
      queryClient.invalidateQueries({
        queryKey:
          getAttributeDefinitionControllerFindEffectiveQueryKey(categoryId),
      }),
      queryClient.invalidateQueries({
        queryKey:
          getAttributeDefinitionControllerFacetCeilingQueryKey(categoryId),
      }),
    ]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (definition: AttributeDefinitionEntity) => {
    setEditing(definition);
    setDialogOpen(true);
  };

  const handleSubmit = (values: AttributeDefinitionFormValues) => {
    const data = formValuesToDto(values);
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data },
        {
          onSuccess: () => {
            void invalidate();
            toast.success(d.toastUpdated);
            setDialogOpen(false);
          },
          onError: () => toast.error(d.toastError),
        },
      );
    } else {
      createMutation.mutate(
        { categoryId, data },
        {
          onSuccess: () => {
            void invalidate();
            toast.success(d.toastCreated);
            setDialogOpen(false);
          },
          onError: () => toast.error(d.toastError),
        },
      );
    }
  };

  const handleDelete = async (definition: AttributeDefinitionEntity) => {
    const confirmed = await confirm({
      title: d.removeTitle(definition.label),
      description: d.confirmRemove,
      confirmLabel: d.remove,
      destructive: true,
    });
    if (!confirmed) return;
    deleteMutation.mutate(
      { id: definition.id },
      {
        onSuccess: () => {
          void invalidate();
          toast.success(d.toastRemoved);
        },
        onError: () => toast.error(d.toastError),
      },
    );
  };

  const saveOrder = (orderedIds: string[], optimistic: boolean) => {
    if (optimistic) setPendingOrder(orderedIds);
    reorderMutation.mutate(
      { categoryId, data: { orderedIds } },
      {
        onSuccess: () => {
          // Keep the dropped order on screen until the refetch has it.
          void invalidate().finally(() => setPendingOrder(null));
          toast.success(d.toastReordered);
        },
        onError: () => {
          setPendingOrder(null);
          toast.error(d.toastError);
        },
      },
    );
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= definitions.length) return;
    const orderedIds = definitions.map((def) => def.id);
    [orderedIds[index], orderedIds[target]] = [
      orderedIds[target],
      orderedIds[index],
    ];
    saveOrder(orderedIds, false);
  };

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    reorderMutation.isPending;

  const renderRow = (props: SortableTreeRowRenderProps): ReactNode => {
    const index = definitions.findIndex((def) => def.id === props.item.id);
    const definition = definitions[index];
    if (!definition) return null;
    return (
      <li
        key={definition.id}
        ref={props.setNodeRef}
        style={props.style}
        className="flex min-h-11 items-center gap-3 bg-card px-3 py-2.5"
      >
        {/* Pointer-only affordance: keyboard and touch reorder through «⋯»,
            so the grip stays out of the tab order and the accessibility tree. */}
        <span
          {...props.handleProps}
          tabIndex={-1}
          aria-hidden="true"
          className="inline-flex shrink-0 cursor-grab items-center text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {definition.label}
            </span>
            {definition.isFilterable && (
              <Badge variant="secondary">{d.filterableBadge}</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {attributeTypeLine(definition)}
            {/* The key is what an import file names the column by (TASK-727). */}
            <span className="font-mono"> · {definition.key}</span>
          </span>
        </div>
        <RowActionsMenu
          label={d.rowActionsAria(definition.label)}
          items={[
            {
              label: d.moveUp,
              onSelect: () => handleMove(index, -1),
              disabled: index === 0 || isMutating,
            },
            {
              label: d.moveDown,
              onSelect: () => handleMove(index, 1),
              disabled: index === definitions.length - 1 || isMutating,
            },
            {
              label: d.edit,
              onSelect: () => openEdit(definition),
              separatorBefore: true,
            },
            {
              label: d.removeMenu,
              onSelect: () => void handleDelete(definition),
              disabled: deleteMutation.isPending,
              destructive: true,
            },
          ]}
        />
      </li>
    );
  };

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {d.heading}
        </h3>
        <Button type="button" size="sm" onClick={openCreate}>
          {d.add}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {d.description}
        <FacetCountInline categoryId={categoryId} />
      </p>

      <FacetCeilingNotice categoryId={categoryId} />

      {listQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{d.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border">
          <SortableTree
            items={definitions.map((def) => ({
              id: def.id,
              parentId: null,
              label: def.label,
            }))}
            maxDepth={1}
            disabled={isMutating}
            renderRow={renderRow}
            onMove={(_groups, next) =>
              saveOrder(
                next.map((i) => i.id),
                true,
              )
            }
          />
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? d.editTitle : d.createTitle}</DialogTitle>
          </DialogHeader>
          <AttributeDefinitionForm
            key={editing?.id ?? "create"}
            defaultValues={
              editing
                ? {
                    key: editing.key,
                    label: editing.label,
                    type: editing.type,
                    unit: editing.unit ?? "",
                    options: (editing.options ?? []).join("\n"),
                    isFilterable: editing.isFilterable,
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            onCancel={() => setDialogOpen(false)}
            isPending={createMutation.isPending || updateMutation.isPending}
            submitLabel={editing ? d.submitUpdate : d.submitCreate}
          />
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </section>
  );
}
