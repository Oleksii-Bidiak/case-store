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
import { useAuth } from "@/entities/session";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
  Label,
  Textarea,
} from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import { mapServerFieldErrors } from "@/shared/lib/form-errors";
import { dict } from "@/shared/config";

const d = dict.staff;

/**
 * `CreatePermissionTemplateDto` / `UpdatePermissionTemplateDto`: name
 * `@MinLength(2) @MaxLength(100)`, description `@MaxLength(500)` (TASK-1984,
 * forms Rule 5d). The name is measured trimmed — what is sent.
 */
const TEMPLATE_NAME_MIN = 2;
const TEMPLATE_NAME_MAX = 100;
const TEMPLATE_DESCRIPTION_MAX = 500;

type TemplateField = "name" | "description";

/** DTO path → this form's field (Rule 6b). */
const TEMPLATE_FIELD_MAP = {
  name: "name",
  description: "description",
} as const;

function validateTemplate(
  name: string,
  description: string,
): Partial<Record<TemplateField, string>> {
  const errors: Partial<Record<TemplateField, string>> = {};
  if (name.length === 0) errors.name = d.templateNameRequired;
  else if (name.length < TEMPLATE_NAME_MIN || name.length > TEMPLATE_NAME_MAX) {
    errors.name = d.templateNameLength;
  }
  if (description.length > TEMPLATE_DESCRIPTION_MAX) {
    errors.description = d.templateDescriptionTooLong;
  }
  return errors;
}

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
  // The catalogue is read through the caller's own `staff/:id/permissions`
  // (see `useGrantableCatalogue`), so the feature supplies the session id.
  const { userId } = useAuth();

  const {
    catalogue,
    zones,
    isLoading: catalogueLoading,
  } = useGrantableCatalogue(userId, { enabled: open });

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
  // Field errors live under their input (Rule 6a); `error` is the refusal
  // that belongs to no field (a permission key, a 5xx…).
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<TemplateField, string>>
  >({});
  const [error, setError] = useState<string | null>(null);
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setGranted(new Set(template?.permissions ?? []));
    setFieldErrors({});
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
    const trimmedDescription = description.trim();
    const next = validateTemplate(trimmedName, trimmedDescription);
    setFieldErrors(next);
    setError(null);
    if (Object.keys(next).length > 0) return;

    const permissions = [...granted].sort();

    // TASK-1984 (Rule 6b/6c): a refusal about the name or the description
    // goes under that field; only the rest is the form's line. Shown once —
    // no toast repeating it.
    const onError = (mutationError: unknown) => {
      const status = apiErrorStatus(mutationError);
      if (status === 409) {
        setFieldErrors({ name: d.templateNameTaken });
        return;
      }
      if (status === 400) {
        const mapped = mapServerFieldErrors(mutationError, TEMPLATE_FIELD_MAP, {
          name: d.templateNameLength,
          description: d.templateDescriptionTooLong,
        });
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          return;
        }
      }
      setError(apiErrorMessage(mutationError) ?? d.templateToastFailed);
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
              maxLength={TEMPLATE_NAME_MAX}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={
                fieldErrors.name ? "permission-template-name-error" : undefined
              }
              onChange={(event) => {
                setName(event.target.value);
                if (fieldErrors.name) {
                  setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
            />
            <FieldError id="permission-template-name-error">
              {fieldErrors.name}
            </FieldError>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permission-template-description">
              {d.templateDescription}
            </Label>
            <Textarea
              id="permission-template-description"
              rows={2}
              value={description}
              maxLength={TEMPLATE_DESCRIPTION_MAX}
              aria-invalid={fieldErrors.description ? true : undefined}
              aria-describedby={
                fieldErrors.description
                  ? "permission-template-description-error"
                  : undefined
              }
              onChange={(event) => {
                setDescription(event.target.value);
                if (fieldErrors.description) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    description: undefined,
                  }));
                }
              }}
            />
            <FieldError id="permission-template-description-error">
              {fieldErrors.description}
            </FieldError>
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
