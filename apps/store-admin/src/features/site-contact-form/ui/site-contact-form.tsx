"use client";

import { useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import { Button, FieldError, FormActionsBar, Input, Label } from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { dict } from "@/shared/config";
import {
  getSiteContactControllerGetSettingsQueryKey,
  useAdminSiteContactControllerUpdate,
  type SiteContactSettingsEntity,
} from "@/entities/site-contact";
import {
  siteContactSchema,
  siteContactFormValuesToDto,
  mapSettingsToFormValues,
  type SiteContactFormInput,
  type SiteContactFormValues,
} from "../model/site-contact-schema";
import {
  DEFAULT_WORKING_HOURS_MODEL,
  copyMondayToWeekdays,
  isModelValid,
  parseWorkingHours,
  serializeWorkingHours,
  type DaySchedule,
  type WorkingHoursModel,
} from "../model/working-hours";
import { WorkingHoursEditor } from "./working-hours-editor";

interface SiteContactFormProps {
  settings: SiteContactSettingsEntity;
}

const LINK_FIELDS = [
  { name: "viberLink", type: "url" },
  { name: "telegramLink", type: "url" },
  { name: "instagramLink", type: "url" },
] as const;

/** Editor state for the workingHours field. `structured` drives the per-day
 *  editor; `raw` keeps the legacy free-text input so unparseable owner text is
 *  never silently destroyed. */
interface WorkingHoursState {
  mode: "structured" | "raw";
  model: WorkingHoursModel;
}

/** Derive the editor state from the stored string: empty → structured editor
 *  seeded with the default schedule; parseable → structured with the parsed
 *  model; anything else → raw free-text mode. */
function deriveWorkingHoursState(stored: string): WorkingHoursState {
  if (!stored.trim()) {
    return { mode: "structured", model: DEFAULT_WORKING_HOURS_MODEL };
  }
  const parsed = parseWorkingHours(stored);
  return parsed
    ? { mode: "structured", model: parsed }
    : { mode: "raw", model: DEFAULT_WORKING_HOURS_MODEL };
}

/**
 * The string the storefront would get for this editor state — `null` while a
 * structured row is invalid (there is no honest string to show or send then).
 */
function effectiveWorkingHours(
  state: WorkingHoursState,
  rawText: string,
): string | null {
  if (state.mode === "raw") return rawText.trim();
  return isModelValid(state.model) ? serializeWorkingHours(state.model) : null;
}

/** What the editor shows for a stored string — the baseline «dirty» compares to. */
function baselineWorkingHours(stored: string): string {
  return effectiveWorkingHours(deriveWorkingHoursState(stored), stored) ?? "";
}

/**
 * Singleton contact-settings form. Seeded from the fetched entity and submits an
 * upsert. Because the row is a singleton, `settings.id` is always the same
 * constant, so the forms.md Rule 2b reset fires once on first data arrival and
 * never clobbers an in-progress edit on a background refetch.
 *
 * `workingHours` (TASK-221): the API field stays a plain string. In structured
 * mode the per-day model is the source of truth and is serialized into the
 * submitted string at submit time; the RHF field is only used directly in raw
 * (legacy free-text) mode. The local editor state is re-seeded under the same
 * `settings.id` guard as the RHF reset (forms.md Rule 1 sync guard — identical
 * identity key, so editor and form can never diverge).
 *
 * Wave 198 (TASK-1053, Н1): three section cards, «Так побачать на сайті» beside
 * them (the same serializer output the storefront gets), «Як у понеділок — на
 * всі будні», and the sticky bar listing what is unsaved with «Скасувати
 * зміни». After a save the form's baseline moves to what was saved, so the bar
 * empties.
 */
export function SiteContactForm({ settings }: SiteContactFormProps) {
  const t = dict.siteContactForm;
  const queryClient = useQueryClient();
  const update = useAdminSiteContactControllerUpdate();
  const ids = useId();

  const [workingHoursState, setWorkingHoursState] = useState<WorkingHoursState>(
    () => deriveWorkingHoursState(settings.workingHours ?? ""),
  );
  // The hours as last seeded or saved — what «dirty» and «Скасувати зміни»
  // compare and return to.
  const [hoursBaseline, setHoursBaseline] = useState(() =>
    baselineWorkingHours(settings.workingHours ?? ""),
  );

  // forms.md Rule 1a: the editor state is seeded from async server data, so a
  // render-time guard re-derives it when the entity identity changes — the
  // same identity key the RHF reset below uses, so editor and form can never
  // diverge. (For the singleton row the id is constant, so this never fires
  // on background refetches and cannot clobber an in-progress edit.)
  const [syncedSettingsId, setSyncedSettingsId] = useState(settings.id);
  if (settings.id !== syncedSettingsId) {
    setSyncedSettingsId(settings.id);
    setWorkingHoursState(deriveWorkingHoursState(settings.workingHours ?? ""));
    setHoursBaseline(baselineWorkingHours(settings.workingHours ?? ""));
  }

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<SiteContactFormInput, unknown, SiteContactFormValues>({
    resolver: zodResolver(siteContactSchema),
    defaultValues: mapSettingsToFormValues(settings),
  });

  // forms.md Rule 2b: re-seed only when the entity identity changes.
  useEffect(() => {
    reset(mapSettingsToFormValues(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.id]);

  const live = useWatch({ control });
  const currentHours = effectiveWorkingHours(
    workingHoursState,
    live.workingHours ?? "",
  );

  const dirtySections: string[] = [];
  if (dirtyFields.email || dirtyFields.phone)
    dirtySections.push(t.dirtyContact);
  if (currentHours !== hoursBaseline) dirtySections.push(t.dirtyHours);
  if (
    dirtyFields.viberLink ||
    dirtyFields.telegramLink ||
    dirtyFields.instagramLink
  ) {
    dirtySections.push(t.dirtyMessengers);
  }

  const handleDayChange = (index: number, day: DaySchedule) => {
    setWorkingHoursState((prev) => {
      const model = prev.model.map((d, i) => (i === index ? day : d));
      return { ...prev, model };
    });
  };

  const copyMonday = () => {
    setWorkingHoursState((prev) => ({
      ...prev,
      model: copyMondayToWeekdays(prev.model),
    }));
  };

  const switchToStructured = () => {
    setWorkingHoursState({
      mode: "structured",
      model: DEFAULT_WORKING_HOURS_MODEL,
    });
  };

  const discard = () => {
    reset();
    setWorkingHoursState(deriveWorkingHoursState(hoursBaseline));
  };

  const onSubmit = (values: SiteContactFormValues) => {
    let workingHours = values.workingHours;
    if (workingHoursState.mode === "structured") {
      // Inline row errors are already visible; just block the submit.
      if (!isModelValid(workingHoursState.model)) return;
      workingHours = serializeWorkingHours(workingHoursState.model);
    }
    const saved = { ...values, workingHours };

    update.mutate(
      { data: siteContactFormValuesToDto(saved) },
      {
        onSuccess: () => {
          // The new baseline is what was just stored: the bar empties and
          // «Скасувати зміни» returns here, not to the pre-save values.
          reset({
            email: saved.email,
            phone: saved.phone,
            workingHours: saved.workingHours ?? "",
            viberLink: saved.viberLink ?? "",
            telegramLink: saved.telegramLink ?? "",
            instagramLink: saved.instagramLink ?? "",
          });
          setHoursBaseline((saved.workingHours ?? "").trim());
          void queryClient.invalidateQueries({
            queryKey: getSiteContactControllerGetSettingsQueryKey(),
          });
          toast.success(dict.siteContact.toastUpdated);
        },
        onError: () => {
          toast.error(dict.siteContact.toastUpdateFailed);
        },
      },
    );
  };

  const emailErrorId = `${ids}-email-error`;
  const phoneHintId = `${ids}-phone-hint`;
  const phoneErrorId = `${ids}-phone-error`;
  const previewHeadingId = `${ids}-preview`;

  const messengers = LINK_FIELDS.filter(({ name }) =>
    (live[name] ?? "").trim(),
  ).map(({ name }) => t[name]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <FormSectionCard title={t.sectionContact}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-email" required>
                  {t.email}
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  required
                  placeholder={t.emailPlaceholder}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? emailErrorId : undefined}
                  {...register("email")}
                />
                <FieldError id={emailErrorId}>
                  {errors.email?.message}
                </FieldError>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-phone" required>
                  {t.phone}
                </Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  required
                  placeholder={t.phonePlaceholder}
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={
                    errors.phone
                      ? `${phoneErrorId} ${phoneHintId}`
                      : phoneHintId
                  }
                  {...register("phone")}
                />
                <FieldError id={phoneErrorId}>
                  {errors.phone?.message}
                </FieldError>
                <p id={phoneHintId} className="text-xs text-muted-foreground">
                  {t.phoneHint}
                </p>
              </div>
            </div>
          </FormSectionCard>

          <FormSectionCard
            title={t.workingHours}
            actions={
              workingHoursState.mode === "structured" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyMonday}
                >
                  {t.copyMonday}
                </Button>
              ) : null
            }
          >
            {workingHoursState.mode === "structured" ? (
              <WorkingHoursEditor
                model={workingHoursState.model}
                onDayChange={handleDayChange}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-workingHours" className="sr-only">
                  {t.workingHours}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t.workingHoursRawNotice}
                </p>
                <Input
                  id="contact-workingHours"
                  type="text"
                  placeholder={t.workingHoursPlaceholder}
                  {...register("workingHours")}
                />
                {errors.workingHours && (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.workingHours.message}
                  </p>
                )}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={switchToStructured}
                  >
                    {t.workingHoursSwitchToStructured}
                  </Button>
                </div>
              </div>
            )}
          </FormSectionCard>

          <FormSectionCard title={t.sectionMessengers}>
            <div className="grid gap-4 md:grid-cols-3">
              {LINK_FIELDS.map(({ name, type }) => {
                const errorId = `${ids}-${name}-error`;
                return (
                  <div key={name} className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`contact-${name}`}>{t[name]}</Label>
                    <Input
                      id={`contact-${name}`}
                      type={type}
                      placeholder={t[`${name}Placeholder`]}
                      aria-invalid={errors[name] ? true : undefined}
                      aria-describedby={errors[name] ? errorId : undefined}
                      {...register(name)}
                    />
                    <FieldError id={errorId}>
                      {errors[name]?.message}
                    </FieldError>
                  </div>
                );
              })}
            </div>
          </FormSectionCard>
        </div>

        {/* «Так побачать на сайті» — the footer's contact block as the
            storefront renders it: the stored strings as-is (TASK-221's
            serializer is the contract), empty messengers left out. */}
        <aside
          aria-labelledby={previewHeadingId}
          className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card lg:sticky lg:top-0 lg:w-75 lg:shrink-0"
        >
          <p
            id={previewHeadingId}
            className="text-xs font-semibold text-muted-foreground"
          >
            {t.previewHeading}
          </p>
          <div className="flex flex-col gap-1 rounded-md bg-foreground p-3.5 text-sm text-background">
            <p className="font-semibold">{t.previewTitle}</p>
            {live.email?.trim() ? <p>{live.email.trim()}</p> : null}
            {live.phone?.trim() ? <p>{live.phone.trim()}</p> : null}
            {currentHours === null ? (
              <p className="italic opacity-80">
                {t.workingHoursPreviewInvalid}
              </p>
            ) : currentHours ? (
              <p>{currentHours}</p>
            ) : null}
            {messengers.length > 0 ? <p>{messengers.join(" · ")}</p> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.previewEmptyMessengers}
          </p>
        </aside>
      </div>

      <FormActionsBar
        variant="sticky"
        dirtySections={dirtySections}
        onDiscard={discard}
        saveLabel={update.isPending ? dict.common.saving : t.submit}
        isSaving={update.isPending}
      />
    </form>
  );
}
