import type { BannerEntity } from "@/shared/api/generated/models";
import { PAGE_CONTAINER, dict } from "@/shared/config";
import { HeroSlider } from "./hero-slider";
import { PromoShowcase } from "./promo-tiles";

interface HeroBannerProps {
  /** HERO_SLIDE banners (falls back to hardcoded slides when empty). */
  heroSlides?: BannerEntity[];
  /** PROMO_TILE banners (falls back to hardcoded tiles when empty), ≤ 5. */
  promoTiles?: BannerEntity[];
}

/**
 * HeroBanner — the «Акції» block of the homepage: the slider beside promo
 * tiles 1–2, with tiles 3–5 in a row beneath it (TASK-2013, direction В: the
 * category sidebar is no longer part of the first screen — the «Категорії»
 * section below carries category access).
 *
 * Since TASK-1952 it is the SECOND block of the first screen: the device
 * picker («Для якого пристрою шукаєте?», `widgets/device-hero`) comes first
 * and holds the page h1, so the slide titles here are h2. The page composes
 * the two (FSD: no widget → widget import). Stays a Server Component; the
 * slider opts into "use client" itself.
 *
 * The slider and promo tiles are driven by admin banners (HERO_SLIDE /
 * PROMO_TILE) when published, and fall back to hardcoded content otherwise.
 */
export function HeroBanner({ heroSlides, promoTiles }: HeroBannerProps = {}) {
  return (
    <section aria-label={dict.home.promoAria} className={PAGE_CONTAINER}>
      <PromoShowcase
        slider={<HeroSlider banners={heroSlides} />}
        banners={promoTiles}
      />
    </section>
  );
}
