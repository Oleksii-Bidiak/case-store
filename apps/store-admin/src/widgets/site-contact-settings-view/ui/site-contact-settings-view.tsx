"use client";

import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { SiteContactForm } from "@/features/site-contact-form";
import { useSiteContactControllerGetSettings } from "@/entities/site-contact";

/**
 * Settings view for the admin-managed site-contact block. Fetches the singleton
 * settings row and renders the edit form. The public GET never 404s — an
 * unseeded row returns an entity with all null fields.
 */
export function SiteContactSettingsView() {
  const { data, isLoading, isError } = useSiteContactControllerGetSettings();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.siteContact.heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dict.siteContact.subheading}
        </p>
      </div>

      {isLoading ? (
        <AdminFormSkeleton />
      ) : isError || !data?.data ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.siteContact.loadError}
        </p>
      ) : (
        <SiteContactForm settings={data.data} />
      )}
    </div>
  );
}
