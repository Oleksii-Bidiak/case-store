import { buildBreadcrumbSchema } from "./buildBreadcrumbSchema";

/** What the model hub's JSON-LD reads — a structural subset of `DeviceHubEntity`. */
export interface DeviceHubSchemaInput {
  /** Absolute site origin, no trailing slash (`SITE_URL`). */
  siteUrl: string;
  model: { name: string; slug: string; brandName: string };
  groups: ReadonlyArray<{
    category: { name: string; slug: string };
    productCount: number;
  }>;
  /** The visible H1 — «Все для iPhone 15 Pro». */
  name: string;
  /** The page's meta description. */
  description?: string;
  /**
   * The visible crumb trail, in order, as on the page. The last crumb is the
   * hub itself and resolves to the hub URL; an EARLIER crumb without `path`
   * is plain text on the page (its target does not exist yet) and is left out
   * of the BreadcrumbList — structured data never names a URL that 404s.
   */
  trail: ReadonlyArray<{ name: string; path?: string }>;
  /** Group name in the ItemList — «Чохли для iPhone 15 Pro». */
  groupName: (categoryName: string, modelName: string) => string;
}

export interface DeviceHubSchemas {
  collectionPage: Record<string, unknown>;
  breadcrumb: Record<string, unknown>;
}

/**
 * JSON-LD for the model hub `/devices/<модель>` (TASK-1954): a `CollectionPage`
 * whose `mainEntity` is an `ItemList` of the hub's groups — each one the
 * compatibility landing `/catalog/<категорія>/<модель>` it links to — plus the
 * `BreadcrumbList` built from the same trail the page renders (TASK-877: the
 * structured trail never differs from the visible one).
 *
 * The device is described as a `Thing` under `about`, not a `Product`: the
 * store sells accessories FOR the model, and a `Product` without offers is
 * exactly what Google's rich-result validator flags. Its maker is a SEPARATE
 * `Brand` entry of `about`: `brand` is not a property of `Thing` (only of
 * Product/Organization/Person/Service), and the validator flags it there.
 * Pure — unit-tested.
 */
export function buildDeviceHubSchemas(
  input: DeviceHubSchemaInput,
): DeviceHubSchemas {
  const hubUrl = `${input.siteUrl}/devices/${input.model.slug}`;

  const collectionPage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    url: hubUrl,
    inLanguage: "uk-UA",
    ...(input.description ? { description: input.description } : {}),
    about: input.model.brandName
      ? [
          { "@type": "Thing", name: input.model.name },
          { "@type": "Brand", name: input.model.brandName },
        ]
      : { "@type": "Thing", name: input.model.name },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.groups.length,
      itemListElement: input.groups.map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: input.groupName(group.category.name, input.model.name),
        url: `${input.siteUrl}/catalog/${group.category.slug}/${input.model.slug}`,
      })),
    },
  };

  const lastIndex = input.trail.length - 1;
  const breadcrumb = buildBreadcrumbSchema(
    input.trail.flatMap((crumb, index) => {
      if (crumb.path) {
        return [{ name: crumb.name, item: `${input.siteUrl}${crumb.path}` }];
      }
      return index === lastIndex ? [{ name: crumb.name, item: hubUrl }] : [];
    }),
  );

  return { collectionPage, breadcrumb };
}
