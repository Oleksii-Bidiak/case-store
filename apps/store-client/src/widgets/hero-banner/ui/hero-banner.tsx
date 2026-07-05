import type { BannerEntity } from "@/shared/api/generated/models";
import { HeroSlider } from "./hero-slider";
import { HeroCategorySidebar } from "./hero-category-sidebar";
import { ModelPicker } from "./model-picker";
import { PromoTiles } from "./promo-tiles";

interface HeroBannerProps {
  /** HERO_SLIDE banners (falls back to hardcoded slides when empty). */
  heroSlides?: BannerEntity[];
  /** PROMO_TILE banners (falls back to hardcoded tiles when empty). */
  promoTiles?: BannerEntity[];
}

/**
 * HeroBanner — the homepage hero block. Composes the category sidebar and the
 * promotional slider (side by side on desktop), the device model picker, and a
 * row of promo tiles. Stays a Server Component; the interactive children
 * (slider, sidebar, picker) opt into "use client" themselves.
 *
 * The slider and promo tiles are driven by admin banners (HERO_SLIDE /
 * PROMO_TILE) when published, and fall back to hardcoded content otherwise.
 */
export function HeroBanner({ heroSlides, promoTiles }: HeroBannerProps = {}) {
  return (
    <section
      aria-label="Головний банер"
      className="mx-auto w-full max-w-7xl px-4 pt-6"
    >
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <HeroCategorySidebar />
        <HeroSlider banners={heroSlides} />
      </div>

      <div className="mt-5">
        <ModelPicker />
      </div>

      <div className="mt-5">
        <PromoTiles banners={promoTiles} />
      </div>
    </section>
  );
}
