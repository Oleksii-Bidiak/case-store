import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  DeviceHubView,
  buildDeviceHubMetadata,
  deviceHubPath,
  deviceHubTrail,
} from "@/widgets/device-hub";
import { ProductCardActions } from "@/widgets/product-card-actions";
import {
  fetchDeviceHub,
  fetchSeriesSiblings,
} from "@/shared/api/device-hubs-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { buildDeviceHubSchemas } from "@/shared/lib/schema/buildDeviceHubSchemas";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { JsonLd } from "@/shared/ui";
import { SITE_URL, dict } from "@/shared/config";

/**
 * `/devices/<модель>` — «Все для iPhone 15 Pro», the model hub (TASK-1954).
 *
 * ── ISR, and nothing personal in it ─────────────────────────────────────────
 * Every hub is rendered on its first visit and cached (`generateStaticParams`
 * returns `[]`: no model is prerendered at build time, so `next build` never
 * depends on the API). The reads go through a fetch tagged `device-hubs`,
 * which store-api purges on every catalogue and device write (TASK-2101); the
 * hour below is the floor for what no write reaches (stock moved by orders).
 * The shopper's own devices live in localStorage only — the HTML renders the
 * neutral state and a client island swaps in «Ваш пристрій» (plan SД3: no
 * `cookies()` anywhere on a cached page).
 *
 * ── 404 and 308 ─────────────────────────────────────────────────────────────
 * The API's 404 is the verdict (unknown/inactive model, or nothing visible for
 * it). Before giving up, a renamed model slug (TASK-699 ledger) is followed
 * with a permanent redirect — as on `/catalog/[category]/[device]`. No
 * `loading.tsx` here, for the same reason as there: a route-level loading
 * boundary would flush a 200 shell before `notFound()` could set the status.
 */
export const revalidate = 3600;

export async function generateStaticParams(): Promise<{ model: string }[]> {
  return [];
}

interface DeviceHubPageProps {
  params: Promise<{ model: string }>;
}

/** One hub read per request — metadata and body share it. */
const resolveHub = cache((slug: string) => fetchDeviceHub(slug));

export async function generateMetadata({
  params,
}: DeviceHubPageProps): Promise<Metadata> {
  const { model } = await params;
  const [hub, seo] = await Promise.all([resolveHub(model), fetchSeoSettings()]);
  return buildDeviceHubMetadata(hub, seo);
}

export default async function DeviceHubPage({ params }: DeviceHubPageProps) {
  const { model: slug } = await params;
  const hub = await resolveHub(slug);

  if (!hub) {
    const newSlug = await resolveSlugRedirect("DEVICE_MODEL", slug);
    if (newSlug && newSlug !== slug) {
      permanentRedirect(deviceHubPath(newSlug));
    }
    notFound();
  }

  const [siblings, seo] = await Promise.all([
    fetchSeriesSiblings(hub.model),
    fetchSeoSettings(),
  ]);
  const description = buildDeviceHubMetadata(hub, seo).description;
  const schemas = buildDeviceHubSchemas({
    siteUrl: SITE_URL,
    model: hub.model,
    groups: hub.groups,
    name: dict.devicePages.hub.heading(hub.model.name),
    description: typeof description === "string" ? description : undefined,
    trail: deviceHubTrail(hub.model.name),
    groupName: dict.meta.compatTitle,
  });

  return (
    <>
      <JsonLd schema={schemas.collectionPage} />
      <JsonLd schema={schemas.breadcrumb} />
      <DeviceHubView
        hub={hub}
        siblings={siblings}
        renderCardAction={(product) => (
          // No «Підходить / Не для <модель>» mark here: everything on the
          // hub fits THIS model, and a mark for the shopper's other active
          // device would contradict the hero's «Усе тут підходить» (mockup
          // DeviceHub §1.6).
          <ProductCardActions product={product} showFit={false} />
        )}
      />
    </>
  );
}
