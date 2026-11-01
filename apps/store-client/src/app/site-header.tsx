"use client";

import type { ComponentProps } from "react";
import {
  Header,
  type CatalogDrillSlotProps,
  type CatalogMenuSlotProps,
} from "@/widgets/header";
import { CatalogDrill, CatalogMegaMenu } from "@/widgets/catalog-menu";

type SiteHeaderProps = Omit<
  ComponentProps<typeof Header>,
  "renderCatalogMenu" | "renderCatalogDrill"
>;

/**
 * The site header with its «Каталог» menus plugged in (TASK-2072). Composed
 * here because the mega menu and the sheet's step-by-step catalog are a
 * widget of their own (FSD: no widget → widget import), and because a render
 * function cannot cross from the server layout into the client `Header`.
 *
 * Everything inside is client-only data (the category tree query, the
 * browser-local device list), so the layout above stays static and every
 * ISR page keeps its cached HTML.
 */
export function SiteHeader(props: SiteHeaderProps) {
  return (
    <Header
      {...props}
      renderCatalogMenu={renderCatalogMenu}
      renderCatalogDrill={renderCatalogDrill}
    />
  );
}

function renderCatalogMenu({ onClose }: CatalogMenuSlotProps) {
  return <CatalogMegaMenu onClose={onClose} />;
}

function renderCatalogDrill({ onNavigate }: CatalogDrillSlotProps) {
  return <CatalogDrill onNavigate={onNavigate} />;
}
