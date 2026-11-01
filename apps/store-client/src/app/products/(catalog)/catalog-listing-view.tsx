"use client";

import type { ComponentProps } from "react";
import { ProductListView } from "@/widgets/product-list";
import {
  catalogFilterDefault,
  useMyDevicesSettings,
} from "@/widgets/my-devices-manager";

type CatalogListingViewProps = Omit<
  ComponentProps<typeof ProductListView>,
  "myDevicesDefault"
>;

/**
 * The catalogue listing with «З урахуванням моїх пристроїв» starting where
 * the «Мої пристрої» settings say (Д3-2 Catalog §11/§20, TASK-2076). The
 * settings belong to a widget the listing widget cannot import, so this
 * route-level shell — `/products` and `/categories/[slug]` — reads them and
 * hands the default down. Client-only (localStorage): the server render gets
 * the settings' defaults, and no device is known there anyway.
 */
export function CatalogListingView(props: CatalogListingViewProps) {
  const settings = useMyDevicesSettings();
  return (
    <ProductListView
      {...props}
      myDevicesDefault={catalogFilterDefault(settings)}
    />
  );
}
