"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  useListPermissionTemplates,
  type PermissionTemplateEntity,
} from "@/entities/staff";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  DeletePermissionTemplateDialog,
  PermissionTemplateDialog,
} from "@/features/permission-template-form";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { PermissionTemplatesSkeleton } from "./PermissionTemplatesSkeleton";

const d = dict.staff;

/**
 * «Шаблони прав» — the sets that get copied onto a person (TASK-480).
 *
 * The copy rule is stated twice on purpose and in two different registers: once
 * here, under the heading, as the description of what a template IS; and again
 * inside the edit dialog, as the first thing an owner reads before changing one.
 * The second is the one that matters — an owner editing «Оператор замовлень»
 * believing it is a live link will think they have just changed what three people
 * can do — and a sentence at the top of a list screen is not read at the moment
 * the mistaken action is taken.
 *
 * No table toolbar here: the template list is a handful of rows with no
 * pagination endpoint behind it (`GET /api/admin/permission-templates` returns
 * them all), so search, filters and a page size would be chrome around nothing.
 */
export function PermissionTemplatesView() {
  const { can } = useAuth();
  const canWrite = can(PERM.staffWrite);

  const { data, isLoading, isError } = useListPermissionTemplates();
  const templates = data?.data ?? [];

  const [editing, setEditing] = useState<PermissionTemplateEntity | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<PermissionTemplateEntity | null>(
    null,
  );

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (template: PermissionTemplateEntity) => {
    setEditing(template);
    setEditorOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {d.templatesHeading}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {d.templatesIntro}
          </p>
          <p className="max-w-3xl text-sm font-medium text-foreground">
            {d.templatesCopyRule}
          </p>
        </div>
        {canWrite && (
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" />
            {d.templateCreate}
          </Button>
        )}
      </div>

      {isLoading ? (
        <PermissionTemplatesSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.templatesLoadError}
        </p>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          <p>{d.templatesEmpty}</p>
          {canWrite && (
            <Button type="button" size="sm" onClick={openCreate}>
              {d.templateCreate}
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.templateColName}</TableHead>
                <TableHead>{d.templateColPermissions}</TableHead>
                <TableHead hideOnMobile>{d.templateColUpdated}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">
                    <span className="flex flex-col gap-0.5">
                      <span>{template.name}</span>
                      {template.description && (
                        <span className="text-xs text-muted-foreground">
                          {template.description}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {template.permissions.length}
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {formatDateTime(template.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && (
                      <span className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(template)}
                        >
                          {dict.common.edit}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleting(template)}
                        >
                          {dict.common.delete}
                        </Button>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {canWrite && (
        <PermissionTemplateDialog
          template={editing}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      )}

      {canWrite && deleting && (
        <DeletePermissionTemplateDialog
          templateId={deleting.id}
          name={deleting.name}
          open
          onOpenChange={(next) => {
            if (!next) setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
