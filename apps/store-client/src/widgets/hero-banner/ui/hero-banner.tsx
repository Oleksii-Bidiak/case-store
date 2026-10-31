import type { BannerEntity } from "@/shared/api/generated/models";
import { PAGE_CONTAINER, dict } from "@/shared/config";
import { HeroSlider } from "./hero-slider";
import { ModelPicker } from "./model-picker";
import { PromoShowcase } from "./promo-tiles";

interface HeroBannerProps {
  /** HERO_SLIDE banners (falls back to hardcoded slides when empty). */
  heroSlides?: BannerEntity[];
  /** PROMO_TILE banners (falls back to hardcoded tiles when empty), ≤ 5. */
  promoTiles?: BannerEntity[];
}

/**
 * HeroBanner — the homepage first screen. The «Акції» block puts the slider
 * beside promo tiles 1–2, with tiles 3–5 in a row beneath it (TASK-2013,
 * direction В: the category sidebar is no longer part of the first screen —
 * the «Категорії» section below carries category access). The device model
 * picker follows. Stays a Server Component; the interactive children (slider,
 * picker) opt into "use client" themselves.
 *
 * The slider and promo tiles are driven by admin banners (HERO_SLIDE /
 * PROMO_TILE) when published, and fall back to hardcoded content otherwise.
 */
export function HeroBanner({ heroSlides, promoTiles }: HeroBannerProps = {}) {
  return (
    <div className={`${PAGE_CONTAINER} flex flex-col gap-5 pt-6`}>
      <section aria-label={dict.home.promoAria}>
        <PromoShowcase
          slider={<HeroSlider banners={heroSlides} />}
          banners={promoTiles}
        />
      </section>

      <ModelPicker />
    </div>
  );
}
