"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, FormActionsBar, Input, Label } from "@/shared/ui";
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

const CONTACT_FIELDS = [
  { name: "email", type: "email" },
  { name: "phone", type: "tel" },
] as const;

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
 * Singleton contact-settings form. Seeded from the fetched entity and submits an
 * upsert. Because the row is a singleton, `settings.id` is always the same
 * constant, so the forms.md Rule 2b reset fires once on first data arrival and
 * never clobbers an in-progress edit on a background refetch.
 *
 * `workingHours` (TASK-221): the API field stays a plain string. In structured
 * mode the per-day model is the source of truth and is serialized into the
 * submitted string at submit time; the RHF field is only used directly in raw
 * (legacy free-text) mode. The local editor state is re-seeded in the same
 * `settings.id`-keyed effect as the RHF reset (forms.md Rule 1 sync guard —
 * identical identity key, so editor and form can never diverge).
 */
export function SiteContactForm({ settings }: SiteContactFormProps) {
  const queryClient = useQueryClient();
  const update = useAdminSiteContactControllerUpdate();

  const [workingHoursState, setWorkingHoursState] = useState<WorkingHoursState>(
    () => deriveWorkingHoursState(settings.workingHours ?? ""),
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
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SiteContactFormInput, unknown, SiteContactFormValues>({
    resolver: zodResolver(siteContactSchema),
    defaultValues: mapSettingsToFormValues(settings),
  });

  // forms.md Rule 2b: re-seed only when the entity identity changes.
  useEffect(() => {
    reset(mapSettingsToFormValues(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.id]);

  const handleDayChange = (index: number, day: DaySchedule) => {
    setWorkingHoursState((prev) => {
      const model = prev.model.map((d, i) => (i === index ? day : d));
      return { ...prev, model };
    });
  };

  const switchToStructured = () => {
    setWorkingHoursState({
      mode: "structured",
      model: DEFAULT_WORKING_HOURS_MODEL,
    });
  };

  const onSubmit = (values: SiteContactFormValues) => {
    let workingHours = values.workingHours;
    if (workingHoursState.mode === "structured") {
      // Inline row errors are already visible; just block the submit.
      if (!isModelValid(workingHoursState.model)) return;
      workingHours = serializeWorkingHours(workingHoursState.model);
    }

    update.mutate(
      { data: siteContactFormValuesToDto({ ...values, workingHours }) },
      {
        onSuccess: () => {
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

  const renderTextField = ({
    name,
    type,
  }: {
    name: (typeof CONTACT_FIELDS | typeof LINK_FIELDS)[number]["name"];
    type: string;
  }) => (
    <div key={name} className="flex flex-col gap-1.5">
      <Label htmlFor={`contact-${name}`}>{dict.siteContactForm[name]}</Label>
      <Input
        id={`contact-${name}`}
        type={type}
        placeholder={dict.siteContactForm[`${name}Placeholder`]}
        {...register(name)}
      />
      {errors[name] && (
        <p role="alert" className="text-sm text-destructive">
          {errors[name]?.message}
        </p>
      )}
    </div>
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      {CONTACT_FIELDS.map(renderTextField)}

      <div className="flex flex-col gap-1.5">
        {workingHoursState.mode === "structured" ? (
          <>
            <span className="text-sm font-medium leading-none">
              {dict.siteContactForm.workingHours}
            </span>
            <WorkingHoursEditor
              model={workingHoursState.model}
              onDayChange={handleDayChange}
            />
          </>
        ) : (
          <>
            <Label htmlFor="contact-workingHours">
              {dict.siteContactForm.workingHours}
            </Label>
            <p className="text-sm text-muted-foreground">
              {dict.siteContactForm.workingHoursRawNotice}
            </p>
            <Input
              id="contact-workingHours"
              type="text"
              placeholder={dict.siteContactForm.workingHoursPlaceholder}
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
                {dict.siteContactForm.workingHoursSwitchToStructured}
              </Button>
            </div>
          </>
        )}
      </div>

      {LINK_FIELDS.map(renderTextField)}

      <FormActionsBar>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? dict.common.saving : dict.siteContactForm.submit}
        </Button>
      </FormActionsBar>
    </form>
  );
}
