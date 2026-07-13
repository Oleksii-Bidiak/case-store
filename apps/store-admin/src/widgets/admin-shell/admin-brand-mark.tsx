"use client";

import { Package } from "lucide-react";
import { useSeoSettingsControllerGetSettings } from "@/entities/seo-settings";
import { dict } from "@/shared/config";

/**
 * Brand mark for the admin shell — shown in the desktop rail and the mobile
 * drawer. Renders the uploaded store logo (TASK-299) when one is set and falls
 * back to the original icon + wordmark otherwise; the fallback also covers the
 * in-flight query, so the header never collapses to empty while loading.
 *
 * Both branches expose the SAME accessible name (`dict.brand`) — the mobile
 * drawer nests this inside its `SheetTitle`, which Radix requires to be labelled.
 *
 * The settings query is shared (same key as the SERP previews and the settings
 * page), so mounting it in the shell costs no extra request, and uploading a new
 * logo invalidates that key — the rail updates without a reload.
 */
export function AdminBrandMark() {
  const { data } = useSeoSettingsControllerGetSettings();
  const logoUrl = data?.data?.logoUrl ?? null;

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={dict.brand}
        className="h-9 w-auto max-w-40 object-contain"
      />
    );
  }

  return (
    <>
      <Package className="size-6 text-primary" aria-hidden="true" />
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        {dict.brand}
      </span>
    </>
  );
}
