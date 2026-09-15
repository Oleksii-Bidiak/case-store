"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  ACCESS_LEVEL,
  CreateStaffDtoRole,
  getListStaffQueryKey,
  groupByZone,
  PermissionZoneGrid,
  useCreateStaff,
  useGrantableCatalogue,
  useListPermissionTemplates,
  useUpdateStaffPermissions,
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
  Input,
  Label,
  Separator,
} from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus, isStaffPassword } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.staff;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** No template chosen. A sentinel rather than `""`, which Radix rejects. */
const NO_TEMPLATE = "__none__";

type Step = "account" | "template" | "permissions" | "confirmAdmin";

interface CreateStaffWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Новий співробітник» — hire, pick a template, tick the boxes, in one pass
 * (TASK-480, plan 181 decision 3).
 *
 * ## The failure this replaces
 *
 * On the live run of 2026-08-27 the owner concluded that a manager could not be
 * created at all. Nothing was broken: the account was made on `/users`, the
 * rights on `/settings/permissions`, and the rights were granted to a ROLE, so
 * "create a manager who can process orders" was three screens and a concept that
 * did not match the question. The dialog this replaces (`CreateUserDialog`)
 * covered only the first of those three steps and then left the operator with an
 * account that could sign in and do nothing.
 *
 * ## Why ADMIN skips steps 2 and 3 entirely
 *
 * A deputy admin holds every permission BY LEVEL and owns no `UserPermission`
 * rows (`holdsEverythingByLevel`). Offering them a template and a grid of
 * checkboxes would be offering a decision with no effect — the ticks would be
 * written, ignored by the guard, and would then read on the card as "this is what
 * the administrator may do", which is false. So the ADMIN branch goes from the
 * account form to a confirmation that spells out what the person is about to
 * gain, which is the decision that actually needs making.
 *
 * ## Why the ADMIN option is absent rather than disabled for a deputy
 *
 * `assertMayAssign` is strictly-greater: you may only hand out a level BELOW your
 * own, so a deputy creating an ADMIN is a 403 with no way to act on it. The old
 * dialog offered the option to everybody and let the server explain; the button
 * that opened it was then gated on `isOwner` to compensate, which was narrower
 * than the API and hid hiring from deputies altogether. Hiding the option and
 * widening the button is the pair that matches the server exactly.
 *
 * ## Two requests, and what happens if the second one fails
 *
 * `POST /api/admin/staff` then `PUT /api/admin/staff/:id/permissions`. There is
 * no transactional "create with permissions" endpoint and inventing one for this
 * screen would put the catalogue's validation in two places. If the second call
 * fails the account still exists — so the toast says so and points at the card,
 * rather than reporting a failure that would send the operator back to create a
 * duplicate account.
 */
export function CreateStaffWizard({
  open,
  onOpenChange,
}: CreateStaffWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isOwner } = useAuth();

  const createStaff = useCreateStaff();
  const setPermissions = useUpdateStaffPermissions();

  const [step, setStep] = useState<Step>("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>(CreateStaffDtoRole.MANAGER);
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [granted, setGranted] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [error, setError] = useState<string | null>(null);

  // Both reads are scoped to the open dialog: a hiring form that is not on
  // screen has no business fetching the catalogue on every staff-list render.
  const {
    catalogue,
    zones,
    isLoading: catalogueLoading,
  } = useGrantableCatalogue({ enabled: open });
  const { data: templatesData } = useListPermissionTemplates({
    query: { enabled: open },
  });
  const templates = templatesData?.data ?? [];

  const groups: ZoneGroup[] = groupByZone(catalogue, zones);
  const isPending = createStaff.isPending || setPermissions.isPending;

  const reset = () => {
    setStep("account");
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setRole(CreateStaffDtoRole.MANAGER);
    setTemplateId(NO_TEMPLATE);
    setGranted(new Set<string>());
    setError(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleOne = (key: string) =>
    setGranted((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(key)) {
        nextSet.delete(key);
      } else {
        nextSet.add(key);
      }
      return nextSet;
    });

  const toggleZone = (group: ZoneGroup, grant: boolean) =>
    setGranted((current) => {
      const nextSet = new Set(current);
      for (const permission of group.permissions) {
        if (grant) {
          nextSet.add(permission.key);
        } else {
          nextSet.delete(permission.key);
        }
      }
      return nextSet;
    });

  const goFromAccount = () => {
    if (!EMAIL.test(email.trim())) {
      setError(d.emailInvalid);
      return;
    }
    if (!isStaffPassword(password)) {
      setError(dict.users.passwordWeak);
      return;
    }
    setError(null);
    setStep(role === CreateStaffDtoRole.ADMIN ? "confirmAdmin" : "template");
  };

  const goFromTemplate = () => {
    // The template is COPIED into the local tick state, not linked — the same
    // semantic the API applies, made visible one step before the save: the boxes
    // on the next step are now editable and the template is out of the picture.
    const chosen = templates.find((template) => template.id === templateId);
    setGranted(new Set(chosen?.permissions ?? []));
    setStep("permissions");
  };

  const submit = () => {
    setError(null);

    createStaff.mutate(
      {
        data: {
          email: email.trim(),
          password,
          role: role as (typeof CreateStaffDtoRole)[keyof typeof CreateStaffDtoRole],
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        },
      },
      {
        onSuccess: (created) => {
          const staffId = created.data.id;
          const finish = () => {
            void queryClient.invalidateQueries({
              queryKey: getListStaffQueryKey(),
            });
            toast.success(d.createToastDone(created.data.email));
            close(false);
            // Land on the person, not back on the list: the point of the wizard
            // is that hiring ends with somebody who can do their job, and the
            // card is where that is visible (and adjustable).
            router.push(`/staff/${staffId}`);
          };

          if (
            role === CreateStaffDtoRole.ADMIN ||
            created.data.level >= ACCESS_LEVEL.ADMIN ||
            granted.size === 0
          ) {
            finish();
            return;
          }

          setPermissions.mutate(
            { id: staffId, data: { permissions: [...granted].sort() } },
            {
              onSuccess: finish,
              onError: () => {
                void queryClient.invalidateQueries({
                  queryKey: getListStaffQueryKey(),
                });
                // The account exists. Saying "не вдалося створити" here is how an
                // operator ends up with two accounts for one person.
                toast.error(d.createPermissionsFailed);
                close(false);
                router.push(`/staff/${staffId}`);
              },
            },
          );
        },
        onError: (mutationError) => {
          const message =
            apiErrorStatus(mutationError) === 409
              ? d.emailTaken
              : (apiErrorMessage(mutationError) ?? d.createToastFailed);
          setError(message);
          toast.error(message);
        },
      },
    );
  };

  const stepNumber = step === "account" ? 1 : step === "template" ? 2 : 3;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d.createHeading}</DialogTitle>
          <DialogDescription>{d.createDescription}</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap items-center gap-2 text-sm">
          <StepChip label={d.stepAccountLabel} active={step === "account"} />
          <StepChip
            label={d.stepTemplateLabel}
            active={step === "template"}
            muted={role === CreateStaffDtoRole.ADMIN}
          />
          <StepChip
            label={d.stepPermissionsLabel}
            active={step === "permissions"}
            muted={role === CreateStaffDtoRole.ADMIN}
          />
        </ol>

        {step === "account" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              {d.stepOf(stepNumber, 3)}
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-wizard-email">{d.fieldEmail}</Label>
              <Input
                id="staff-wizard-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-wizard-password">{d.fieldPassword}</Label>
              <Input
                id="staff-wizard-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="staff-wizard-password-hint"
              />
              <p
                id="staff-wizard-password-hint"
                className="text-xs text-muted-foreground"
              >
                {dict.users.passwordHint}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-wizard-first-name">
                  {d.fieldFirstName}
                </Label>
                <Input
                  id="staff-wizard-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-wizard-last-name">
                  {d.fieldLastName}
                </Label>
                <Input
                  id="staff-wizard-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-foreground">
                {d.fieldLevel}
              </legend>

              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="staff-wizard-level"
                  value={CreateStaffDtoRole.MANAGER}
                  checked={role === CreateStaffDtoRole.MANAGER}
                  onChange={() => setRole(CreateStaffDtoRole.MANAGER)}
                  className="mt-1"
                />
                <span>{d.levelManagerOption}</span>
              </label>

              {/* Absent, not disabled, for a deputy: `assertMayAssign` is
                  strictly-greater, so this option can only ever 403 for them. */}
              {isOwner ? (
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="staff-wizard-level"
                    value={CreateStaffDtoRole.ADMIN}
                    checked={role === CreateStaffDtoRole.ADMIN}
                    onChange={() => setRole(CreateStaffDtoRole.ADMIN)}
                    className="mt-1"
                  />
                  <span>{d.levelAdminOption}</span>
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {d.levelAdminOwnerOnly}
                </p>
              )}
            </fieldset>
          </div>
        )}

        {step === "template" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              {d.stepOf(stepNumber, 3)}
            </p>
            <p className="text-sm text-muted-foreground">
              {d.templatesCopyRule}
            </p>

            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{d.templateApplyAria}</legend>

              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="staff-wizard-template"
                  value={NO_TEMPLATE}
                  checked={templateId === NO_TEMPLATE}
                  onChange={() => setTemplateId(NO_TEMPLATE)}
                  className="mt-1"
                />
                <span>{d.templateNoneOption}</span>
              </label>

              {templates.map((template) => (
                <label
                  key={template.id}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <input
                    type="radio"
                    name="staff-wizard-template"
                    value={template.id}
                    checked={templateId === template.id}
                    onChange={() => setTemplateId(template.id)}
                    className="mt-1"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{template.name}</span>
                    {template.description && (
                      <span className="text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {d.permissionsCount(template.permissions.length)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {step === "permissions" && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              {d.stepOf(stepNumber, 3)}
            </p>
            <p className="text-sm text-muted-foreground">
              {d.permissionsIntro}
            </p>
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
                idPrefix="staff-wizard-perm"
                disabled={isPending}
              />
            )}
          </div>
        )}

        {step === "confirmAdmin" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">
              {d.promoteWho(email.trim())}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{d.promoteGain1}</li>
              <li>{d.promoteGain2}</li>
              <li>{d.promoteGain3}</li>
              <li>{d.promoteGain4}</li>
            </ul>
            <Separator />
            <p className="text-sm font-medium text-foreground">
              {d.promoteUndo}
            </p>
          </div>
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
            onClick={() => {
              if (step === "account") {
                close(false);
                return;
              }
              setError(null);
              // «Назад» from step 3 lands on the template choice; from step 2
              // and from the ADMIN confirmation it lands on the account form,
              // because the ADMIN branch never visited a template.
              setStep(step === "permissions" ? "template" : "account");
            }}
            disabled={isPending}
          >
            {step === "account" ? dict.common.cancel : d.prev}
          </Button>

          {step === "account" && (
            <Button type="button" onClick={goFromAccount}>
              {d.next}
            </Button>
          )}
          {step === "template" && (
            <Button type="button" onClick={goFromTemplate}>
              {d.next}
            </Button>
          )}
          {(step === "permissions" || step === "confirmAdmin") && (
            <Button
              type="button"
              variant={step === "confirmAdmin" ? "destructive" : "default"}
              onClick={submit}
              disabled={isPending}
            >
              {isPending
                ? dict.common.saving
                : step === "confirmAdmin"
                  ? d.promoteConfirm
                  : d.createSubmit}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepChip({
  label,
  active,
  muted = false,
}: {
  label: string;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <li>
      <Badge
        variant={active ? "default" : muted ? "outline" : "secondary"}
        aria-current={active ? "step" : undefined}
      >
        {label}
      </Badge>
    </li>
  );
}
