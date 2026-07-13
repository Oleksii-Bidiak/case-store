"use client";

import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { SeoSettingsForm } from "@/features/seo-settings-form";
import { StoreLogoUpload } from "@/features/store-logo-upload";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { SeoHealthSection } from "./seo-health-section";

/**
 * Settings view for the admin-managed global SEO block. Fetches the singleton
 * settings row and renders the edit form. The public GET never 404s — an
 * unseeded row returns an entity with zero-config defaults.
 *
 * The store logo (TASK-299) sits beside the form rather than inside it: it is
 * written through its own multipart upload/delete routes, not the settings
 * upsert, so it is a sibling feature composed here.
 */
export function SeoSettingsView() {
  const { data, isLoading, isError } = useSeoSettingsControllerGetSettings();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.seoSettings.heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dict.seoSettings.subheading}
        </p>
      </div>

      {isLoading ? (
        <AdminFormSkeleton />
      ) : isError || !data?.data ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.seoSettings.loadError}
        </p>
      ) : (
        <>
          <SeoHealthSection settings={data.data} />
          <StoreLogoUpload logoUrl={data.data.logoUrl ?? null} />
          <SeoSettingsForm settings={data.data} />
        </>
      )}
    </div>
  );
}
