"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { getDeviceFamilyTone } from "@/entities/device";
import { setActiveDevice, type MyDevice } from "@/entities/my-devices";
import { useCatalogLandingControllerFindDeviceHub } from "@/shared/api/generated/catalog/catalog";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { dict, H1_CLASS } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui";

import {
  deviceCategoryHref,
  deviceHubHref,
  hasHub,
  pickHeroProducts,
  quickCategories,
} from "../model/hero-models";
import {
  FOCUS_RING,
  HERO_PANEL,
  PANEL_PILL,
  PRIMARY_PILL,
} from "./hero-styles";

const t = dict.devicePicker.hero;

/** Others shown next to «Інший пристрій» (list positions 2–4). */
const OTHER_DEVICES_SHOWN = 3;
/** The hub changes with catalogue edits only. */
const HUB_STALE_TIME_MS = 5 * 60 * 1000;

export interface DeviceHeroPicks {
  device: MyDevice;
  /** Up to 3 products that fit, one per top category first. */
  products: PublicProductEntity[];
}

interface HeroDevicePanelProps {
  devices: readonly MyDevice[];
  /**
   * The active model's visible-product count from the model catalogue;
   * `undefined` while it loads. 0 → the model has no hub (the API 404s).
   */
  productCount: number | undefined;
  onOpenPicker: () => void;
  renderPicks?: (picks: DeviceHeroPicks) => ReactNode;
}

/**
 * State B of the homepage first block — a device is saved: the ACTIVE
 * device's panel in its family tone. Kicker, the device as the page h1, how
 * much fits, «Все для …» to its hub (the one primary), its biggest
 * categories, then the other saved devices (one tap switches) and «Інший
 * пристрій». The product rail is a slot: the cards' buy / wishlist actions
 * are a widget of their own, so the page composes them (FSD: no widget →
 * widget import).
 */
export function HeroDevicePanel({
  devices,
  productCount,
  onOpenPicker,
  renderPicks,
}: HeroDevicePanelProps) {
  const device = devices[0];
  const withHub = hasHub(productCount);
  const hub = useCatalogLandingControllerFindDeviceHub(device?.slug ?? "", {
    query: {
      enabled: Boolean(device) && withHub,
      staleTime: HUB_STALE_TIME_MS,
      retry: false,
    },
  });
  if (!device) return null;

  const tone = getDeviceFamilyTone(device.family);
  const groups = hub.data?.data.groups ?? [];
  const categories = quickCategories(groups);
  const products = renderPicks ? pickHeroProducts(groups) : [];
  const picks =
    renderPicks && products.length > 0
      ? renderPicks({ device, products })
      : null;
  const others = devices.slice(1, 1 + OTHER_DEVICES_SHOWN);

  return (
    <section
      aria-label={t.panelAria(device.name)}
      className={cn(
        HERO_PANEL,
        tone.surface,
        picks && "lg:grid-cols-3 lg:items-start",
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
          />
          {device.label ? t.kickerLabel(device.label) : t.kicker}
        </p>
        <h1
          className={cn(
            H1_CLASS,
            "mt-1.5 leading-tight break-words text-foreground",
          )}
        >
          {device.name}
        </h1>

        {productCount === undefined ? (
          <Skeleton className="mt-1.5 h-5 w-64 max-w-full rounded-sm bg-card/70" />
        ) : (
          <p className="mt-1.5 text-base text-muted-foreground">
            {withHub
              ? t.fits(dict.devicePicker.productCount(productCount))
              : t.noneFit}
          </p>
        )}

        <Link
          href={withHub ? deviceHubHref(device.slug) : "/products"}
          className={cn(
            "mt-4.5 inline-flex h-13 max-w-full items-center gap-2.5 rounded-cta px-6 text-base font-semibold",
            PRIMARY_PILL,
            FOCUS_RING,
          )}
        >
          <span className="truncate">
            {withHub ? t.cta(device.name) : t.catalogCta}
          </span>
          <ArrowRight aria-hidden="true" className="size-4.5 shrink-0" />
        </Link>

        {categories.length > 0 && (
          <nav aria-label={t.categoriesAria(device.name)} className="mt-4">
            <ul className="flex flex-wrap gap-1.5">
              {categories.map(({ category, productCount: count }) => (
                <li key={category.id}>
                  <Link
                    href={deviceCategoryHref(category.slug, device.slug)}
                    className={cn(
                      PANEL_PILL,
                      "h-11 bg-card px-3.5 text-sm font-semibold",
                      FOCUS_RING,
                    )}
                  >
                    {category.name}
                    <span className="font-medium text-muted-foreground">
                      {count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-4.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {others.length > 0 && <span className="mr-0.5">{t.alsoYours}</span>}
          {others.map((other) => {
            const otherTone = getDeviceFamilyTone(other.family);
            return (
              <button
                key={other.modelId}
                type="button"
                aria-label={t.showFor(other.name, other.label)}
                onClick={() => setActiveDevice(other.modelId)}
                className={cn(
                  PANEL_PILL,
                  "h-11 max-w-full bg-card/70 px-3 font-semibold",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    otherTone.strong,
                  )}
                />
                <span className="truncate">
                  {other.label
                    ? `${other.name}${dict.devicePicker.metaSeparator}${other.label}`
                    : other.name}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenPicker}
            className={cn(
              PANEL_PILL,
              "h-11 bg-card/70 px-3 font-semibold",
              FOCUS_RING,
            )}
          >
            <Plus aria-hidden="true" className="size-3.5 shrink-0" />
            {t.otherDevice}
          </button>
        </div>
      </div>

      {picks && <div className="min-w-0 lg:col-span-2">{picks}</div>}
    </section>
  );
}
