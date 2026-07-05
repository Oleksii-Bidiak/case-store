"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  useAttributeDefinitionControllerFindByCategory,
  useAttributeDefinitionControllerCreate,
  useAttributeDefinitionControllerUpdate,
  useAttributeDefinitionControllerDelete,
  useAttributeDefinitionControllerReorder,
  getAttributeDefinitionControllerFindByCategoryQueryKey,
  type AttributeDefinitionEntity,
} from "@/entities/attribute-definition";
import { AttributeDefinitionForm } from "./attribute-definition-form";
import {
  formValuesToDto,
  type AttributeDefinitionFormValues,
} from "../model/attribute-definition-schema";

const d = dict.attributeDefinitions;

interface AttributeDefinitionEditorProps {
  categoryId: string;
}

/**
 * Category-scoped structured-spec template editor (TASK-191). A self-contained
 * section embedded on the category edit page: lists the category's OWN
 * definitions (not inherited ones) with add / edit / remove / reorder, each
 * wired to its own mutation. Not part of the category RHF form — templates have
 * their own endpoints, so there is no "unsaved changes" coupling.
 */
export function AttributeDefinitionEditor({
  categoryId,
}: AttributeDefinitionEditorProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AttributeDefinitionEntity | null>(
    null,
  );

  const listQuery = useAttributeDefinitionControllerFindByCategory(categoryId);
  const definitions = listQuery.data?.data ?? [];

  const createMutation = useAttributeDefinitionControllerCreate();
  const updateMutation = useAttributeDefinitionControllerUpdate();
  const deleteMutation = useAttributeDefinitionControllerDelete();
  const reorderMutation = useAttributeDefinitionControllerReorder();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey:
        getAttributeDefinitionControllerFindByCategoryQueryKey(categoryId),
    });

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

  const handleDelete = (definition: AttributeDefinitionEntity) => {
    if (!window.confirm(d.confirmRemove)) return;
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

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= definitions.length) return;
    const orderedIds = definitions.map((def) => def.id);
    [orderedIds[index], orderedIds[target]] = [
      orderedIds[target],
      orderedIds[index],
    ];
    reorderMutation.mutate(
      { categoryId, data: { orderedIds } },
      {
        onSuccess: () => {
          void invalidate();
          toast.success(d.toastReordered);
        },
        onError: () => toast.error(d.toastError),
      },
    );
  };

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    reorderMutation.isPending;

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">{d.heading}</h3>
          <p className="text-sm text-muted-foreground">{d.description}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          {d.add}
        </Button>
      </div>

      {listQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{d.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {definitions.map((definition, index) => (
            <li
              key={definition.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {definition.label}
                  </span>
                  {definition.isFilterable && (
                    <Badge variant="secondary">{d.filterableBadge}</Badge>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {definition.key} · {definition.type}
                  {definition.unit ? ` · ${definition.unit}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0 || isMutating}
                  aria-label={d.moveUp}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === definitions.length - 1 || isMutating}
                  aria-label={d.moveDown}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(definition)}
                >
                  {d.edit}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(definition)}
                  disabled={deleteMutation.isPending}
                >
                  {d.remove}
                </Button>
              </div>
            </li>
          ))}
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
    </section>
  );
}
