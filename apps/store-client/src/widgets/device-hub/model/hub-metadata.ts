import type { Metadata } from "next";
import type {
  DeviceHubEntity,
  SeoSettingsEntity,
} from "@/shared/api/generated/models";
import { SITE_URL, dict } from "@/shared/config";
import {
  buildOgImages,
  resolveSeo,
  resolveSiteName,
  toMetadataTitle,
} from "@/shared/lib/seo";
import { deviceHubPath, ledeCategories } from "./hub-copy";

/**
 * `<head>` of the model hub `/devices/<модель>` (TASK-1954).
 *
 * Same precedence chain as the compatibility landings (TASK-490), with the
 * DEVICE MODEL as the entity: its admin `metaTitle` / `metaDescription`
 * (tier 1) → the generated «Аксесуари для iPhone 15 Pro» and a description
 * naming the first categories (tier 2; the model's own intro text wins over
 * the generated sentence when the admin wrote one) → `SeoSettings` (tier 3).
 *
 * Always self-canonical and indexable: the hub has no query-string variants
 * (no filters, no pages), so a `?utm_…` copy consolidates onto the bare URL.
 * `hub === null` is the instant before `notFound()` owns the response.
 */
export function buildDeviceHubMetadata(
  hub: DeviceHubEntity | null,
  seo: SeoSettingsEntity | null,
): Metadata {
  const t = dict.devicePages.hub;
  if (!hub) return { title: t.metaFallbackTitle };

  const { model } = hub;
  const siteName = resolveSiteName(seo);
  const { names } = ledeCategories(hub.groups);
  const generatedDescription = t.metaDescription(
    model.name,
    names,
    hub.productCount,
    siteName,
  );

  const resolved = resolveSeo({
    settings: seo,
    entityTitle: model.metaTitle,
    entityDescription: model.metaDescription,
    content: {
      name: t.metaTitle(model.name),
      description: model.description ?? generatedDescription,
    },
  });

  const title = toMetadataTitle(resolved, {
    settings: seo,
    siteName,
    fallback: t.heading(model.name),
  });
  const description = resolved.description ?? generatedDescription;
  const url = `${SITE_URL}${deviceHubPath(model.slug)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // Declaring `openGraph` replaces the root layout's object wholesale, so
    // `images` is re-stated (same note as the compat landing).
    openGraph: {
      title: title.absolute,
      description,
      url,
      siteName,
      locale: "uk_UA",
      type: "website",
      images: buildOgImages({
        defaultOgImage: resolved.ogImage,
        alt: title.absolute,
        siteName,
      }),
    },
  };
}
