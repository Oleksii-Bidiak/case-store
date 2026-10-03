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
  FormActionsBar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

  // «Змінено 2 права: + Бачити платежі, − Блокувати…» — named, in catalogue
  // order, grants first. A revocation is one untick away from being saved, so
  // the bar says it in words rather than «є незбережені зміни».
  const labelOf = new Map(
    (entity.catalogue ?? []).map((entry) => [entry.key, entry.label]),
  );
  const order = (entity.catalogue ?? []).map((entry) => entry.key);
  const added = order.filter(
    (key) => granted.has(key) && !serverPermissions.includes(key),
  );
  const removed = order.filter(
    (key) => !granted.has(key) && serverPermissions.includes(key),
  );
  const changeSummary = isDirty
    ? d.permissionsChanged(
        added.length + removed.length,
        [
          ...added.map((key) => `+ ${labelOf.get(key) ?? key}`),
          ...removed.map((key) => `− ${labelOf.get(key) ?? key}`),
        ].join(", "),
      )
    : undefined;

  const formId = `staff-permissions-${userId}`;

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canWrite && isDirty && !isPending) handleSave();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {d.permissionsHeading}
        </h3>
        <Badge variant="secondary">
          {d.permissionsCount(serverPermissions.length)}
        </Badge>
        {appliedTemplate && (
          <Badge variant="outline">
            {d.templateMatch(appliedTemplate.name)}
          </Badge>
        )}
      </div>

      {!canWrite && (
        <p role="status" className="text-sm text-muted-foreground">
          {d.permissionsReadOnly}
        </p>
      )}

      {/* The artboard's «Шаблон … · змінено» banner with «Повернути до
          шаблону» needs the API to say WHICH template was applied — it stores
          no link (TASK-445). Until it does, the honest control stays: apply a
          template, which replaces the set (and is audited by name). */}
      {canWrite && templates.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">
              {d.templateApplyLabel}
            </span>
            <p className="text-xs text-muted-foreground">
              {d.templateApplyHint}
            </p>
          </div>
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
                className="w-full bg-background sm:w-64"
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
              variant="outline"
              className="bg-background"
              onClick={handleApplyTemplate}
              disabled={templateId === NO_TEMPLATE || isPending}
            >
              {d.templateApplySubmit}
            </Button>
          </div>
        </section>
      )}

      <p className="text-sm text-muted-foreground">{d.permissionsIntro}</p>

      <PermissionZoneGrid
        groups={groups}
        granted={granted}
        onToggle={toggleOne}
        onToggleZone={toggleZone}
        idPrefix={`staff-perm-${userId}`}
        disabled={!canWrite || isPending}
      />

      {/* One save for the whole grid, pinned to the bottom (Д-ж2 С3), saying
          exactly which rights are about to be granted and revoked. */}
      {canWrite && (
        <FormActionsBar
          variant="sticky"
          summary={changeSummary}
          onDiscard={() => setGranted(new Set(serverPermissions))}
          saveLabel={
            updatePermissions.isPending
              ? d.permissionsSaving
              : d.permissionsSave
          }
          formId={formId}
          isSaving={isPending}
          saveDisabled={!isDirty}
        />
      )}
    </form>
  );
}
