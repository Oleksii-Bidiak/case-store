import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import {
  getDeviceFamily,
  getDeviceFamilyTone,
  type DeviceFamily,
} from "@/entities/device";
import type {
  DeviceHubEntity,
  DeviceHubGroupEntity,
  DeviceModelListItemEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";
import { FOCUS_RING, H1_CLASS, PAGE_CONTAINER, dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { CategoryIcon, ProductCard } from "@/shared/ui";
import {
  HUB_RAIL_SIZE,
  buildHubLede,
  compatLandingPath,
  deviceHubPath,
  deviceHubTrail,
  hubSectionHeadingId,
  hubSectionId,
  lowerFirst,
} from "../model/hub-copy";
import { DeviceHubChips } from "./device-hub-chips";
import { DeviceHubActions, DeviceHubKicker } from "./device-hub-state";
import { HubFamilyIcon } from "./hub-icons";

export interface DeviceHubViewProps {
  hub: DeviceHubEntity;
  /** Other models of the series with a hub of their own (≤ 5). */
  siblings: readonly DeviceModelListItemEntity[];
  /**
   * The card footer («В наявності», «Купити», the heart), injected by the page
   * so this widget does not import another widget (FSD: no widget → widget).
   */
  renderCardAction?: (product: PublicProductEntity) => ReactNode;
}

/** Card width in the rail: 2 → 3 → 4 → 5 visible (the mockup's steps). */
const RAIL_IMAGE_SIZES = "(max-width: 767px) 50vw, 240px";

/**
 * «Все для <модель>» — the model hub (TASK-1954, DeviceHub mockup).
 *
 * Server-rendered from the ISR hub read; the only client islands are the
 * device-state kicker/actions (personal, localStorage-only — never in the
 * cached HTML) and the chips' smooth scroll. Hierarchy: crumbs → the hero in
 * the model's FAMILY tone (the one hue on the page; categories stay neutral)
 * → one section per top-level category with a five-card rail and the link to
 * its compatibility landing → the rest of the series.
 */
export function DeviceHubView({
  hub,
  siblings,
  renderCardAction,
}: DeviceHubViewProps) {
  const { model } = hub;
  const t = dict.devicePages.hub;
  const family = getDeviceFamily(model);
  const tone = getDeviceFamilyTone(family);
  const trail = deviceHubTrail(model.name);
  const stateModel = {
    id: model.id,
    slug: model.slug,
    name: model.name,
    brandName: model.brandName,
    brandSlug: model.brandSlug,
    series: model.series,
  };

  return (
    <div className={`${PAGE_CONTAINER} pt-4 pb-16 md:pt-6`}>
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-4 hidden flex-wrap items-center gap-1.5 text-sm text-muted-foreground md:flex"
      >
        {trail.map((crumb, i) => (
          <Fragment key={crumb.name}>
            {i > 0 && (
              <ChevronRight
                aria-hidden="true"
                className="size-3.5 opacity-60"
              />
            )}
            {crumb.path ? (
              <Link
                href={crumb.path}
                className={cn(
                  "rounded-sm underline-offset-3 transition-interactive hover:text-foreground hover:underline active:opacity-75",
                  FOCUS_RING,
                )}
              >
                {crumb.name}
              </Link>
            ) : i === trail.length - 1 ? (
              <span
                aria-current="page"
                className="font-semibold text-foreground"
              >
                {crumb.name}
              </span>
            ) : (
              <span>{crumb.name}</span>
            )}
          </Fragment>
        ))}
      </nav>

      <section
        aria-labelledby="dh-h1"
        className={cn(
          "flex flex-col gap-5 rounded-panel px-4 py-6 sm:px-6 md:flex-row md:items-center md:gap-8 md:px-10 md:py-9",
          tone.surface,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
            />
            <DeviceHubKicker model={stateModel} />
          </p>
          <h1
            id="dh-h1"
            className={`mt-1.5 break-words ${H1_CLASS} text-foreground`}
          >
            {t.heading(model.name)}
          </h1>
          <p className="mt-2.5 max-w-xl text-base leading-relaxed text-muted-foreground">
            {buildHubLede(hub)}
          </p>
          <DeviceHubActions model={stateModel} className="mt-4.5" />
          <DeviceHubChips
            className="mt-4.5"
            chips={hub.groups.map((group) => ({
              slug: group.category.slug,
              name: group.category.name,
              icon: group.category.icon,
              count: group.productCount,
            }))}
          />
        </div>
        {/* The model's picture slot. No model photo exists in the API yet
            (BACKLOG: device-model image) — the family glyph on its strong
            disc stands in, decorative. */}
        <div aria-hidden="true" className="hidden shrink-0 md:block">
          <div
            className={cn(
              "flex size-50 items-center justify-center rounded-panel text-footer lg:size-60",
              tone.strong,
            )}
          >
            <HubFamilyIcon family={family} className="size-22 lg:size-26" />
          </div>
        </div>
      </section>

      {hub.groups.map((group) => (
        <HubSection
          key={group.category.id}
          group={group}
          modelName={model.name}
          modelSlug={model.slug}
          renderCardAction={renderCardAction}
        />
      ))}

      {siblings.length > 0 && (
        <HubRelated series={model.series} siblings={siblings} />
      )}
    </div>
  );
}

function HubSection({
  group,
  modelName,
  modelSlug,
  renderCardAction,
}: {
  group: DeviceHubGroupEntity;
  modelName: string;
  modelSlug: string;
  renderCardAction?: (product: PublicProductEntity) => ReactNode;
}) {
  const t = dict.devicePages.hub;
  const { category } = group;
  const headingId = hubSectionHeadingId(category.slug);
  const products = group.products.slice(0, HUB_RAIL_SIZE);

  return (
    <section
      id={hubSectionId(category.slug)}
      aria-labelledby={headingId}
      className="scroll-mt-(--sticky-header-offset) pt-10"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-menu bg-card text-foreground shadow-card">
            <CategoryIcon icon={category.icon} size={24} />
          </span>
          <div className="min-w-0">
            {/* H3-role sizing (design-system §3), not H2_CLASS: a hub has many
                category sections, and a 30px heading would sit right under the
                36px hero H1 and flatten the hierarchy. */}
            <h2
              id={headingId}
              tabIndex={-1}
              className="font-display text-xl leading-tight font-bold text-foreground outline-none"
            >
              {category.name}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t.sectionCount(group.productCount, modelName)}
            </p>
          </div>
        </div>
        <Link
          href={compatLandingPath(category.slug, modelSlug)}
          className={cn(
            "inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-foreground",
            "transition-interactive hover:border-foreground/35 hover:bg-muted active:scale-98 motion-reduce:active:scale-100",
            FOCUS_RING,
          )}
        >
          {t.seeAll(group.productCount)}
          <span className="sr-only">
            {t.seeAllContext(lowerFirst(category.name), modelName)}
          </span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {/* Rail: 2 cards visible on phones (bleeding to the screen edge so the
          third says "scrolls"), 3 from md, 4 from lg, all 5 from xl. The gap
          is each slide's right padding, cancelled by the rail's negative right
          margin, so slide widths stay plain fractions — no arbitrary values. */}
      <ul
        aria-label={t.railAria(category.name)}
        className="-mt-2 -ml-4 -mr-4 flex snap-x snap-mandatory scroll-pl-4 overflow-x-auto pt-2 pb-4 pl-4 pr-1 scrollbar-none sm:-ml-6 sm:-mr-6 sm:scroll-pl-6 sm:pl-6 sm:pr-3 md:ml-0 md:-mr-4 md:scroll-pl-0 md:pl-0 md:pr-0"
      >
        {products.map((product) => (
          <li
            key={product.id}
            className="w-1/2 shrink-0 snap-start pr-3 md:w-1/3 md:pr-4 lg:w-1/4 xl:w-1/5"
          >
            <ProductCard
              product={product}
              imageSizes={RAIL_IMAGE_SIZES}
              action={renderCardAction?.(product)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HubRelated({
  series,
  siblings,
}: {
  series: string | null;
  siblings: readonly DeviceModelListItemEntity[];
}) {
  const t = dict.devicePages.hub;
  return (
    <section aria-label={t.relatedAria} className="pt-10">
      <div className="flex flex-col gap-3.5 rounded-card bg-card p-5 shadow-card md:flex-row md:items-center md:justify-between md:gap-6 md:px-7 md:py-6">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-foreground">
            {t.relatedTitle(series)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.relatedNote}</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {siblings.map((sibling) => (
            <li key={sibling.id}>
              <SiblingPill model={sibling} family={getDeviceFamily(sibling)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SiblingPill({
  model,
  family,
}: {
  model: DeviceModelListItemEntity;
  family: DeviceFamily | null;
}) {
  const t = dict.devicePages.hub;
  return (
    <Link
      href={deviceHubPath(model.slug)}
      aria-label={t.relatedPillAria(model.name, model.productCount)}
      className={cn(
        "inline-flex h-11 items-center gap-2.5 rounded-full px-4 text-sm font-semibold text-foreground",
        // A pill with the DeviceHub mockup's own lift (no resting shadow).
        "transition-interactive hover:-translate-y-0.5 hover:shadow-lift active:scale-98",
        "motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
        getDeviceFamilyTone(family).surface,
        FOCUS_RING,
      )}
    >
      {model.name}
      <small className="text-sm font-medium text-muted-foreground tabular-nums">
        {dict.devicePages.formatCount(model.productCount)}
      </small>
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}
