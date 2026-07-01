import { HeroSlider } from "./hero-slider";
import { HeroCategorySidebar } from "./hero-category-sidebar";
import { ModelPicker } from "./model-picker";
import { PromoTiles } from "./promo-tiles";

/**
 * HeroBanner — the homepage hero block. Composes the category sidebar and the
 * promotional slider (side by side on desktop), the device model picker, and a
 * row of promo tiles. Stays a Server Component; the interactive children
 * (slider, sidebar, picker) opt into "use client" themselves.
 */
export function HeroBanner() {
  return (
    <section
      aria-label="Головний банер"
      className="mx-auto w-full max-w-7xl px-4 pt-6"
    >
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <HeroCategorySidebar />
        <HeroSlider />
      </div>

      <div className="mt-5">
        <ModelPicker />
      </div>

      <div className="mt-5">
        <PromoTiles />
      </div>
    </section>
  );
}
