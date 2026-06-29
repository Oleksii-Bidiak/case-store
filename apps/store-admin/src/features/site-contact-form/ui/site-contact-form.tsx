"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Input, Label } from "@/shared/ui";
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

interface SiteContactFormProps {
  settings: SiteContactSettingsEntity;
}

const FIELDS = [
  { name: "email", type: "email" },
  { name: "phone", type: "tel" },
  { name: "workingHours", type: "text" },
  { name: "viberLink", type: "url" },
  { name: "telegramLink", type: "url" },
  { name: "instagramLink", type: "url" },
] as const;

/**
 * Singleton contact-settings form. Seeded from the fetched entity and submits an
 * upsert. Because the row is a singleton, `settings.id` is always the same
 * constant, so the forms.md Rule 2b reset fires once on first data arrival and
 * never clobbers an in-progress edit on a background refetch.
 */
export function SiteContactForm({ settings }: SiteContactFormProps) {
  const queryClient = useQueryClient();
  const update = useAdminSiteContactControllerUpdate();

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

  const onSubmit = (values: SiteContactFormValues) => {
    update.mutate(
      { data: siteContactFormValuesToDto(values) },
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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-2xl flex-col gap-5"
      noValidate
    >
      {FIELDS.map(({ name, type }) => (
        <div key={name} className="flex flex-col gap-1.5">
          <Label htmlFor={`contact-${name}`}>
            {dict.siteContactForm[name]}
          </Label>
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
      ))}

      <div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? dict.common.saving : dict.siteContactForm.submit}
        </Button>
      </div>
    </form>
  );
}
