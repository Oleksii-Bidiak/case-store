// «Каталог» menu (TASK-2072): the mega menu shown from `lg` inside the header
// pill's panel, and the step-by-step catalog inside the menu sheet below `xl`.
//
// The header does not import this widget (no widget → widget imports): the
// app layer composes the two through the header's render slots
// (`app/site-header.tsx`).
export {
  CatalogMegaMenu,
  ROOT_HOVER_INTENT_MS,
  type CatalogMegaMenuProps,
} from "./ui/catalog-mega-menu";
export { CatalogDrill, type CatalogDrillProps } from "./ui/catalog-drill";
