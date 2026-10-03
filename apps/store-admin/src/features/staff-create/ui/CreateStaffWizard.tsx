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
  levelLabel,
  PermissionZoneGrid,
  samePermissionSet,
  useApplyPermissionTemplate,
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
  FieldError,
  FormAlert,
  Input,
  Label,
  PasswordInput,
  PasswordRequirements,
  RadioCard,
  RadioCardGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stepper,
  type StepperStep,
} from "@/shared/ui";
import { apiErrorMessage, apiErrorStatus, isStaffPassword } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.staff;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** No template chosen. A sentinel rather than `""`, which Radix rejects. */
const NO_TEMPLATE = "__none__";

/**
 * `who` → `access` (→ `confirmAdmin`, a sub-state of «Доступ») → `login`.
 * The confirmation is not a step of its own: the stepper keeps «Доступ»
 * current and says «підтвердіть», as on the artboard (StaffProposal С6).
 */
type Step = "who" | "access" | "confirmAdmin" | "login";

const IDS = {
  email: "staff-wizard-email",
  emailHint: "staff-wizard-email-hint",
  emailError: "staff-wizard-email-error",
  firstName: "staff-wizard-first-name",
  lastName: "staff-wizard-last-name",
  template: "staff-wizard-template",
  templateHint: "staff-wizard-template-hint",
  password: "staff-wizard-password",
  passwordHint: "staff-wizard-password-hint",
  passwordError: "staff-wizard-password-error",
} as const;

interface CreateStaffWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Додати співробітника» — who, what access, how they sign in, in one pass
 * (TASK-480, plan 181 decision 3; wave 198 StaffProposal С4–С7).
 *
 * ## The failure this replaced
 *
 * On the live run of 2026-08-27 the owner concluded that a manager could not be
 * created at all. Nothing was broken: the account was made on `/users`, the
 * rights on `/settings/permissions`, and the rights were granted to a ROLE, so
 * "create a manager who can process orders" was three screens and a concept that
 * did not match the question.
 *
 * ## Three steps, and what the artboard has that the API does not (TASK-1059)
 *
 * The artboard's third step is «Запрошення»: a one-time link by email, or a
 * temporary password the panel forces to change; step one also recognises an
 * email that already belongs to a customer and promotes that account. None of
 * that exists in the API yet — there is no invitation model, no forced change,
 * and `POST /api/admin/staff` answers 409 for a customer's address. So the third
 * step is honestly «Вхід»: the initial password, handed over in person, exactly
 * as before. Nothing here promises a letter that will not be sent.
 *
 * ## Why ADMIN skips the template and the ticks
 *
 * A deputy admin holds every permission BY LEVEL and owns no `UserPermission`
 * rows (`holdsEverythingByLevel`). Offering them a template and a grid of
 * checkboxes would be offering a decision with no effect. So the ADMIN branch
 * of «Доступ» is a confirmation that spells out what the person is about to
 * gain, with a destructive «Так, призначити адміністратором» — which only
 * acknowledges; the account is created on the last step, like any other.
 *
 * ## Why the ADMIN option is absent rather than disabled for a deputy
 *
 * `assertMayAssign` is strictly-greater: you may only hand out a level BELOW your
 * own, so a deputy creating an ADMIN is a 403 with no way to act on it. Hiding
 * the option (and saying why) matches the server exactly.
 *
 * ## Up to three requests, and what happens if a later one fails
 *
 * `POST /api/admin/staff`, then — when a template was chosen —
 * `POST /api/admin/permission-templates/:id/apply` (TASK-638), then
 * `PUT /api/admin/staff/:id/permissions` only if the ticks were changed on top
 * of the template (or no template was chosen and something is ticked). Apply,
 * not a client-side copy + PUT, because the apply route's audit row NAMES the
 * template. If a later call fails the account still exists — so the toast says
 * so and points at the card, rather than reporting a failure that would send
 * the operator back to create a duplicate account.
 */
export function CreateStaffWizard({
  open,
  onOpenChange,
}: CreateStaffWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isOwner, userId } = useAuth();

  const createStaff = useCreateStaff();
  const setPermissions = useUpdateStaffPermissions();
  const applyTemplate = useApplyPermissionTemplate();

  const [step, setStep] = useState<Step>("who");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>(CreateStaffDtoRole.MANAGER);
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [granted, setGranted] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // Remounts the grid when a template re-seeds the ticks, so the zones that
  // now hold rights open (the grid decides that once, on mount).
  const [gridKey, setGridKey] = useState(0);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Both reads are scoped to the open dialog: a hiring form that is not on
  // screen has no business fetching the catalogue on every staff-list render.
  const {
    catalogue,
    zones,
    isLoading: catalogueLoading,
  } = useGrantableCatalogue(userId, { enabled: open });
  const { data: templatesData } = useListPermissionTemplates({
    query: { enabled: open },
  });
  const templates = templatesData?.data ?? [];
  const chosenTemplate = templates.find(
    (template) => template.id === templateId,
  );

  const groups: ZoneGroup[] = groupByZone(catalogue, zones);
  const isPending =
    createStaff.isPending ||
    applyTemplate.isPending ||
    setPermissions.isPending;
  const isAdmin = role === CreateStaffDtoRole.ADMIN;

  const reset = () => {
    setStep("who");
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setRole(CreateStaffDtoRole.MANAGER);
    setTemplateId(NO_TEMPLATE);
    setGranted(new Set<string>());
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
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

  const pickTemplate = (value: string) => {
    if (value === "") return; // Radix bubble-input bounce (TASK-201)
    setTemplateId(value);
    // The template is COPIED into the ticks, not linked — the same semantic
    // the API applies, made visible before the save: the boxes below are now
    // editable and the template is out of the picture.
    const chosen = templates.find((template) => template.id === value);
    setGranted(new Set(chosen?.permissions ?? []));
    setGridKey((key) => key + 1);
  };

  const goFromWho = () => {
    if (!EMAIL.test(email.trim())) {
      setEmailError(d.emailInvalid);
      return;
    }
    setEmailError(null);
    setStep("access");
  };

  const goFromAccess = () => {
    setStep(isAdmin ? "confirmAdmin" : "login");
  };

  const back = () => {
    setFormError(null);
    if (step === "who") {
      close(false);
      return;
    }
    // «Назад» from the last step lands where it came from: the ADMIN
    // confirmation for an administrator, the access step for a manager.
    const previous: Record<Exclude<Step, "who">, Step> = {
      access: "who",
      confirmAdmin: "access",
      login: isAdmin ? "confirmAdmin" : "access",
    };
    setStep(previous[step]);
  };

  const submit = () => {
    if (!isStaffPassword(password)) {
      setPasswordError(dict.users.passwordWeak);
      return;
    }
    setPasswordError(null);
    setFormError(null);

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

          if (isAdmin || created.data.level >= ACCESS_LEVEL.ADMIN) {
            finish();
            return;
          }

          const failed = () => {
            void queryClient.invalidateQueries({
              queryKey: getListStaffQueryKey(),
            });
            // The account exists. Saying "не вдалося створити" here is how an
            // operator ends up with two accounts for one person.
            toast.error(d.createPermissionsFailed);
            close(false);
            router.push(`/staff/${staffId}`);
          };

          const writeTicks = () => {
            setPermissions.mutate(
              { id: staffId, data: { permissions: [...granted].sort() } },
              { onSuccess: finish, onError: failed },
            );
          };

          if (!chosenTemplate) {
            if (granted.size === 0) {
              finish();
              return;
            }
            writeTicks();
            return;
          }

          // A template was chosen: APPLY it (TASK-638) rather than PUT its keys,
          // so the audit row names the template. If the operator then changed
          // ticks on top, those edits follow as an ordinary permission write,
          // which is its own honest row: the template, then what was changed.
          applyTemplate.mutate(
            { id: chosenTemplate.id, data: { userId: staffId } },
            {
              onSuccess: () => {
                if (
                  samePermissionSet([...granted], chosenTemplate.permissions)
                ) {
                  finish();
                  return;
                }
                writeTicks();
              },
              onError: failed,
            },
          );
        },
        onError: (mutationError) => {
          // A taken address is a fact about the FIELD on step one: go back to
          // it and say so under it (form canon 1.5), instead of a red line on
          // a step where nothing can be done about it.
          if (apiErrorStatus(mutationError) === 409) {
            setEmailError(d.emailTaken);
            setStep("who");
            toast.error(d.emailTaken);
            return;
          }
          const message = apiErrorMessage(mutationError) ?? d.createToastFailed;
          setFormError(message);
          toast.error(message);
        },
      },
    );
  };

  /* ── stepper ───────────────────────────────────────────────────────── */

  const accessDone = step === "login";
  const rightsLabel = isAdmin
    ? d.permissionsFullAccess.toLowerCase()
    : d.permissionsColumn(granted.size);
  const accessSummary = d.accessSummary(
    levelLabel(isAdmin ? ACCESS_LEVEL.ADMIN : ACCESS_LEVEL.MANAGER),
    rightsLabel,
    isAdmin ? undefined : chosenTemplate?.name,
  );
  const whoSummary = [firstName.trim(), lastName.trim()]
    .filter(Boolean)
    .join(" ");

  const steps: StepperStep[] = [
    {
      id: "who",
      title: d.stepWho,
      description: step === "who" ? d.stepWhoHint : email.trim(),
      state: step === "who" ? "now" : "done",
    },
    {
      id: "access",
      title: d.stepAccess,
      description:
        step === "confirmAdmin"
          ? d.stepAccessConfirm
          : accessDone
            ? accessSummary
            : d.stepAccessHint,
      state:
        step === "access" || step === "confirmAdmin"
          ? "now"
          : accessDone
            ? "done"
            : "todo",
    },
    {
      id: "login",
      title: d.stepLogin,
      description: d.stepLoginHint,
      state: step === "login" ? "now" : "todo",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d.createHeading}</DialogTitle>
          <DialogDescription>{d.createDescription}</DialogDescription>
        </DialogHeader>

        <Stepper steps={steps} aria-label={d.stepperAria} />

        {step === "who" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={IDS.email} required>
                {d.fieldEmail}
              </Label>
              <Input
                id={IDS.email}
                type="email"
                autoComplete="off"
                value={email}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={
                  emailError
                    ? `${IDS.emailError} ${IDS.emailHint}`
                    : IDS.emailHint
                }
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    goFromWho();
                  }
                }}
              />
              <FieldError id={IDS.emailError}>{emailError}</FieldError>
              <p id={IDS.emailHint} className="text-xs text-muted-foreground">
                {d.fieldEmailHint}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={IDS.firstName}>{d.fieldFirstName}</Label>
                <Input
                  id={IDS.firstName}
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={IDS.lastName}>{d.fieldLastName}</Label>
                <Input
                  id={IDS.lastName}
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === "access" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span
                id="staff-wizard-level"
                className="text-sm font-medium text-foreground"
              >
                {d.fieldLevel}
                <span aria-hidden="true">{" *"}</span>
              </span>
              <RadioCardGroup
                aria-labelledby="staff-wizard-level"
                value={role}
                onValueChange={(value) => {
                  if (value) setRole(value);
                }}
              >
                <RadioCard
                  value={CreateStaffDtoRole.MANAGER}
                  title={d.levelManagerOption}
                />
                {/* Absent, not disabled, for a deputy: `assertMayAssign` is
                    strictly-greater, so this option can only ever 403. */}
                {isOwner ? (
                  <RadioCard
                    value={CreateStaffDtoRole.ADMIN}
                    title={d.levelAdminOption}
                  />
                ) : null}
              </RadioCardGroup>
              {!isOwner && (
                <p className="text-xs text-muted-foreground">
                  {d.levelAdminOwnerOnly}
                </p>
              )}
            </div>

            {!isAdmin && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={IDS.template}>{d.fieldTemplate}</Label>
                  <Select value={templateId} onValueChange={pickTemplate}>
                    <SelectTrigger
                      id={IDS.template}
                      aria-label={d.fieldTemplate}
                      aria-describedby={IDS.templateHint}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEMPLATE}>
                        {d.templateNoneOption}
                      </SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p
                    id={IDS.templateHint}
                    className="text-xs text-muted-foreground"
                  >
                    {chosenTemplate?.description
                      ? `${chosenTemplate.description} ${d.fieldTemplateHint}`
                      : d.fieldTemplateHint}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {d.permissionsIntro}
                    </p>
                    <Badge variant="secondary">
                      {d.permissionsCount(granted.size)}
                    </Badge>
                  </div>
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
                      key={gridKey}
                      groups={groups}
                      granted={granted}
                      onToggle={toggleOne}
                      onToggleZone={toggleZone}
                      idPrefix="staff-wizard-perm"
                      disabled={isPending}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {step === "confirmAdmin" && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-foreground">
              {d.adminConfirmLead}{" "}
              <b className="font-semibold break-all">{email.trim()}</b>.{" "}
              {d.adminConfirmTail}
            </p>
            <ul className="flex flex-col gap-1 pl-5 text-muted-foreground">
              <li>{d.adminGain1}</li>
              <li>{d.adminGain2}</li>
              <li>{d.adminGain3}</li>
              <li>{d.adminGain4}</li>
            </ul>
            <p className="font-medium text-foreground">{d.adminUndo}</p>
          </div>
        )}

        {step === "login" && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{d.stepWho}</dt>
                <dd className="break-words text-foreground">
                  {whoSummary ? `${whoSummary} · ` : ""}
                  {email.trim()}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">
                  {d.stepAccess}
                </dt>
                <dd className="text-foreground">{accessSummary}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-foreground">
                {d.loginHeading}
              </p>
              <Label htmlFor={IDS.password} required>
                {d.fieldPassword}
              </Label>
              <PasswordInput
                id={IDS.password}
                autoComplete="new-password"
                value={password}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={
                  passwordError
                    ? `${IDS.passwordError} ${IDS.passwordHint}`
                    : IDS.passwordHint
                }
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (passwordError) setPasswordError(null);
                }}
              />
              <FieldError id={IDS.passwordError}>{passwordError}</FieldError>
              <PasswordRequirements value={password} />
              <p
                id={IDS.passwordHint}
                className="text-xs text-muted-foreground"
              >
                {d.passwordHandOver}
              </p>
            </div>

            <FormAlert>{formError}</FormAlert>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={back}
            disabled={isPending}
          >
            {step === "who" ? dict.common.cancel : d.prev}
          </Button>

          {step === "who" && (
            <Button type="button" onClick={goFromWho}>
              {d.next}
            </Button>
          )}
          {step === "access" && (
            <Button type="button" onClick={goFromAccess}>
              {d.next}
            </Button>
          )}
          {step === "confirmAdmin" && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setStep("login")}
            >
              {d.promoteConfirm}
            </Button>
          )}
          {step === "login" && (
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? dict.common.saving : d.createSubmit}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
