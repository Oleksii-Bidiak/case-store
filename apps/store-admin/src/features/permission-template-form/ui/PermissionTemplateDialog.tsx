"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getListPermissionTemplatesQueryKey,
  groupByZone,
  PermissionZoneGrid,
  useCreatePermissionTemplate,
  useGrantableCatalogue,
  useUpdatePermissionTemplate,
  type PermissionTemplateEntity,
  type ZoneGroup,
} from "@/entities/staff";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.staff;

interface PermissionTemplateDialogProps {
  /** `null` creates a new template; a template edits that one. */
  template: PermissionTemplateEntity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create or edit a permission template (`/api/admin/permission-templates`).
 *
 * ## The copy rule is rendered HERE, at the top, deliberately
 *
 * «Редагування шаблону НЕ змінює прав тих, хто вже працює» is the single most
 * likely misunderstanding of the whole access model, and the moment it bites is
 * exactly this dialog: an owner who thinks a template is a live link will edit
 * «Оператор замовлень», close the screen, and believe three people just lost
 * access to the order queue. They did not — applying a template copies its keys
 * onto a person and stores no link back (plan 181, decision 2 and invariant 5) —
 * but nothing on screen said so. A sentence in a help page is not where that gets
 * read; the form where the mistaken action happens is.
 *
 * The copy semantic is not a limitation being apologised for, either: a live link
 * would mean editing a template silently changes what somebody can do while they
 * are working, and would go out of step the first time anybody was granted one
 * extra permission on top.
 *
 * ## Form state
 *
 * `name`, `description` and the tick set are seeded from an async-loaded template
 * and follow `docs/conventions/forms.md` rule 1a — a render-time resync keyed on
 * the open/closed state, the template id and its `updatedAt`, so reopening the
 * dialog on a different row, after somebody else saved, or after an abandoned
 * draft repaints rather than showing the previous one. Not `key`-remounting: the
 * name field is focus-sensitive.
 */
export function PermissionTemplateDialog({
  template,
  open,
  onOpenChange,
}: PermissionTemplateDialogProps) {
  const queryClient = useQueryClient();
  const createTemplate = useCreatePermissionTemplate();
  const updateTemplate = useUpdatePermissionTemplate();

  const {
    catalogue,
    zones,
    isLoading: catalogueLoading,
  } = useGrantableCatalogue({ enabled: open });

  // forms.md Rule 1a. The signature covers the identity AND the version, so a
  // refetch that changed the set repaints while an unchanged one does not.
  //
  // `open` IS PART OF THE SIGNATURE, and it is not decoration. This component is
  // mounted for the whole life of the page (Radix unmounts only `DialogContent`),
  // so without it the signature for the create case was the constant
  // "new-template" and the state from the previous visit survived every close.
  // Two ways that bit:
  //   - create «Продавець» with nine ticks, save, reopen «Створити шаблон» — the
  //     form still held «Продавець» and its nine ticks, so renaming and saving
  //     produced a template carrying a set nobody chose for that job, which is
  //     then COPIED onto the next hire;
  //   - open an existing template, untick five boxes, Cancel, reopen it — no
  //     server change means a byte-identical `updatedAt`, so the abandoned draft
  //     rendered as the template's current contents.
  // Closing now changes the signature, which resyncs from the prop on the way
  // back in. The field stays focus-safe: this is still a render-time resync, not
  // a `key` remount.
  const signature = `${open ? "open" : "closed"}::${
    template ? `${template.id}::${template.updatedAt}` : "new-template"
  }`;
  const [syncedSignature, setSyncedSignature] = useState(signature);
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [granted, setGranted] = useState<ReadonlySet<string>>(
    () => new Set(template?.permissions ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setGranted(new Set(template?.permissions ?? []));
    setError(null);
  }

  const groups: ZoneGroup[] = groupByZone(catalogue, zones);
  const isPending = createTemplate.isPending || updateTemplate.isPending;

  const toggleOne = (key: string) =>
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const toggleZone = (group: ZoneGroup, grant: boolean) =>
    setGranted((current) => {
      const next = new Set(current);
      for (const permission of group.permissions) {
        if (grant) {
          next.add(permission.key);
        } else {
          next.delete(permission.key);
        }
      }
      return next;
    });

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: getListPermissionTemplatesQueryKey(),
    });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError(d.templateNameRequired);
      return;
    }
    setError(null);

    const permissions = [...granted].sort();
    const trimmedDescription = description.trim();

    const onError = (mutationError: unknown) => {
      const message = apiErrorMessage(mutationError) ?? d.templateToastFailed;
      setError(message);
      toast.error(message);
    };

    if (template) {
      updateTemplate.mutate(
        {
          id: template.id,
          data: {
            name: trimmedName,
            description: trimmedDescription || null,
            permissions,
          },
        },
        {
          onSuccess: () => {
            invalidate();
            toast.success(d.templateToastSaved(trimmedName));
            onOpenChange(false);
          },
          onError,
        },
      );
      return;
    }

    createTemplate.mutate(
      {
        data: {
          name: trimmedName,
          description: trimmedDescription || null,
          permissions,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          toast.success(d.templateToastCreated(trimmedName));
          onOpenChange(false);
        },
        onError,
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {template ? d.templateEditHeading : d.templateCreateHeading}
            </DialogTitle>
            <DialogDescription>{d.templatesCopyRule}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permission-template-name">{d.templateName}</Label>
            <Input
              id="permission-template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permission-template-description">
              {d.templateDescription}
            </Label>
            <Textarea
              id="permission-template-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <Badge variant="secondary" className="w-fit">
            {d.permissionsCount(granted.size)}
          </Badge>

          {catalogueLoading ? (
            <p className="text-sm text-muted-foreground">
              {dict.common.loading}
            </p>
          ) : groups.length === 0 ? (
            <p role="alert" className="text-sm text-destructive">
              {d.permissionsLoadError}
            </p>
          ) : (
            <PermissionZoneGrid
              groups={groups}
              granted={granted}
              onToggle={toggleOne}
              onToggleZone={toggleZone}
              idPrefix="permission-template-perm"
              disabled={isPending}
            />
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? dict.common.saving : dict.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
