"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getGetStaffPermissionsQueryKey,
  getListStaffQueryKey,
  groupByZone,
  matchingTemplate,
  PermissionZoneGrid,
  useApplyPermissionTemplate,
  useGetStaffPermissions,
  useListPermissionTemplates,
  useUpdateStaffPermissions,
  type ZoneGroup,
} from "@/entities/staff";
import { getGetMyPermissionsQueryKey } from "@/entities/session";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@/shared/ui";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.staff;

/** «Оберіть шаблон» placeholder — a sentinel, because Radix rejects `""`. */
const NO_TEMPLATE = "__none__";

interface StaffPermissionsFormProps {
  userId: string;
  /**
   * Whether this session may actually write. Read-only rendering is the honest
   * answer for a deputy looking at another deputy: `assertMayManage` refuses the
   * PUT, and a save button that always 403s teaches nothing.
   */
  canWrite: boolean;
}

/**
 * What one person may do, as a grid of ticks (TASK-480, plan 181 P3/P4).
 *
 * ## The `holdsEverythingByLevel` branch is the point of this component
 *
 * `GET /api/admin/staff/:id/permissions` answers with the person's own rows AND
 * the flag. For the owner and every deputy admin that flag is true and the rows
 * are EMPTY — correctly, because they pass every guard by level and were never
 * granted anything. Rendering the grid for them would draw forty unticked boxes
 * under the heading «Права цієї людини», which reads as "this administrator can
 * do nothing": the exact opposite of the truth, on the screen whose whole job is
 * to say who can do what. So that case gets a sentence instead of a grid, and the
 * sentence names the only way to narrow such an account — lower the level.
 *
 * ## Form state
 *
 * `granted` is seeded from async server data, so it follows
 * `docs/conventions/forms.md` rule 1a: a render-time resync keyed on a signature
 * of the server's answer, no effect and no extra render pass. The shape is
 * lifted from the retired `PermissionMatrixForm`, where it existed because
 * switching roles had to repaint the grid; here it earns its keep on the refetch
 * after «Застосувати шаблон», which changes the server set under an open form.
 *
 * ## Why applying a template is a request and not a local seed
 *
 * The wizard seeds ticks locally (the person does not exist yet). Here there is a
 * real endpoint — `POST /api/admin/permission-templates/:id/apply` — and using it
 * is what puts a «застосовано шаблон» row in the audit log with the before-image.
 * Seeding the boxes locally and letting the operator press Save would record an
 * ordinary permission edit and lose the fact that a template was involved.
 *
 * The copy under the control says REPLACE, because that is what it does: the
 * template's keys become the person's keys, including the ones it does not carry
 * being removed.
 */
export function StaffPermissionsForm({
  userId,
  canWrite,
}: StaffPermissionsFormProps) {
  const queryClient = useQueryClient();
  const updatePermissions = useUpdateStaffPermissions();
  const applyTemplate = useApplyPermissionTemplate();

  const { data, isLoading, isError } = useGetStaffPermissions(userId);
  const { data: templatesData } = useListPermissionTemplates();
  const templates = useMemo(
    () => templatesData?.data ?? [],
    [templatesData?.data],
  );

  const entity = data?.data;

  const serverPermissions = useMemo(
    () => [...(entity?.permissions ?? [])].sort(),
    [entity?.permissions],
  );

  // forms.md Rule 1a — resynchronised during render whenever the server answer
  // changes (a refetch after «Застосувати шаблон», or another tab's edit).
  const signature = `${userId}::${serverPermissions.join(",")}`;
  const [syncedSignature, setSyncedSignature] = useState(signature);
  const [granted, setGranted] = useState<ReadonlySet<string>>(
    () => new Set(serverPermissions),
  );
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setGranted(new Set(serverPermissions));
  }

  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);

  const groups: ZoneGroup[] = useMemo(
    () => groupByZone(entity?.catalogue ?? [], entity?.zones ?? []),
    [entity?.catalogue, entity?.zones],
  );

  const appliedTemplate = useMemo(
    () => matchingTemplate(serverPermissions, templates),
    [serverPermissions, templates],
  );

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
    );
  }

  if (isError || !entity) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {d.permissionsLoadError}
      </p>
    );
  }

  if (entity.holdsEverythingByLevel) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {d.holdsEverythingHeading}
        </h3>
        <p className="text-sm text-muted-foreground">{d.holdsEverythingHint}</p>
      </section>
    );
  }

  const isDirty =
    granted.size !== serverPermissions.length ||
    serverPermissions.some((key) => !granted.has(key));

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

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetStaffPermissionsQueryKey(userId),
    });
    // The list row prints «скільки прав», so it goes stale on every save here.
    void queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
    // And a second tab signed in as the edited person should not keep its old
    // menu. Harmless when the editor is somebody else — it refetches one key.
    void queryClient.invalidateQueries({
      queryKey: getGetMyPermissionsQueryKey(),
    });
  };

  const handleSave = () => {
    updatePermissions.mutate(
      { id: userId, data: { permissions: [...granted].sort() } },
      {
        onSuccess: () => {
          invalidate();
          toast.success(d.permissionsToastSaved);
        },
        onError: (error) => {
          // The level refusal explains itself far better than a generic toast.
          toast.error(apiErrorMessage(error) ?? d.permissionsToastFailed);
        },
      },
    );
  };

  const handleApplyTemplate = () => {
    const chosen = templates.find((template) => template.id === templateId);
    if (!chosen) return;

    applyTemplate.mutate(
      { id: chosen.id, data: { userId } },
      {
        onSuccess: () => {
          invalidate();
          setTemplateId(NO_TEMPLATE);
          toast.success(d.templateApplyToastDone(chosen.name));
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error) ?? d.templateApplyToastFailed);
        },
      },
    );
  };

  const isPending = updatePermissions.isPending || applyTemplate.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {d.permissionsHeading}
        </h3>
        <p className="text-sm text-muted-foreground">{d.permissionsIntro}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {d.permissionsCount(serverPermissions.length)}
          </Badge>
          {appliedTemplate && (
            <Badge variant="outline">
              {d.templateMatch(appliedTemplate.name)}
            </Badge>
          )}
        </div>
      </div>

      {!canWrite && (
        <p role="status" className="text-sm text-muted-foreground">
          {d.permissionsReadOnly}
        </p>
      )}

      {canWrite && templates.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-border p-3">
          <span className="text-sm font-medium text-foreground">
            {d.templateApplyLabel}
          </span>
          <p className="text-xs text-muted-foreground">{d.templateApplyHint}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={templateId}
              onValueChange={(value) => {
                if (value === "") return; // Radix bubble-input bounce (TASK-201)
                setTemplateId(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger
                id="staff-template-apply"
                aria-label={d.templateApplyAria}
                className="w-full sm:w-72"
              >
                <SelectValue placeholder={d.templateApplyAria} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleApplyTemplate}
              disabled={templateId === NO_TEMPLATE || isPending}
            >
              {d.templateApplySubmit}
            </Button>
          </div>
        </section>
      )}

      <Separator />

      <PermissionZoneGrid
        groups={groups}
        granted={granted}
        onToggle={toggleOne}
        onToggleZone={toggleZone}
        idPrefix={`staff-perm-${userId}`}
        disabled={!canWrite || isPending}
      />

      {canWrite && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isPending}
          >
            {updatePermissions.isPending
              ? d.permissionsSaving
              : d.permissionsSave}
          </Button>
          {isDirty && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGranted(new Set(serverPermissions))}
                disabled={isPending}
              >
                {d.permissionsReset}
              </Button>
              <span className="text-sm text-muted-foreground">
                {d.permissionsDirtyHint}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
