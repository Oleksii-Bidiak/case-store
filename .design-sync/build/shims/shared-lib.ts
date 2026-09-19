// design-sync shim for `@/shared/lib`. The storefront UI consumes only pure
// helpers from this barrel: `formatMoney` (format), `pickProductGradient`
// (product-gradient), `getCardPricing` (product-pricing), `colorSwatch`
// (color-swatch). The real barrel also re-exports ./schema, which pulls in the
// generated API clients and the axios instance (process.env.NEXT_PUBLIC_API_URL)
// — none of which a presentational component needs.
export * from "@/shared/lib/format/index";
export * from "@/shared/lib/product-gradient";
export * from "@/shared/lib/product-pricing";
export * from "@/shared/lib/color-swatch";
