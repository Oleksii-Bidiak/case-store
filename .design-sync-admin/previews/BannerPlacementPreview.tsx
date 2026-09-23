import { BannerPlacementPreview } from "@store/store-admin";

// The live scale model beside the banner form (features/banner-form). One cell
// per placement — the four slots the storefront has. Copy is the seeded banners.
export const HeroSlide = () => (
  <div style={{ width: "100%" }}>
    <BannerPlacementPreview
      placement="HERO_SLIDE"
      title="Аксесуари для вашого iPhone"
      subtitle="Чохли, захисне скло та зарядки — усе в одному місці"
      ctaLabel="До каталогу"
      ctaHref="/products"
      theme="accent"
    />
  </div>
);

// Desktop shows the tile at a third of the row, beside two ghost neighbours.
export const PromoTile = () => (
  <div style={{ width: "100%" }}>
    <BannerPlacementPreview
      placement="PROMO_TILE"
      title="Захисне скло та плівки"
      subtitle="Комплекти на дві та три штуки — вигідніше"
      ctaLabel="Купити"
      ctaHref="/categories/screen-protectors"
      theme="sale"
    />
  </div>
);

export const PromoBanner = () => (
  <div style={{ width: "100%" }}>
    <BannerPlacementPreview
      placement="PROMO_BANNER"
      title="Доставка Новою поштою по всій Україні"
      subtitle="Вартість розраховуємо на кроці оформлення — без сюрпризів"
      ctaLabel="Замовити"
      ctaHref="/products"
    />
  </div>
);

// Only title + CTA link are used; the link underlines the strip text.
export const AnnouncementBar = () => (
  <div style={{ width: "100%" }}>
    <BannerPlacementPreview
      placement="ANNOUNCEMENT_BAR"
      title="Акційні ціни на добірку товарів — дивіться розділ «Акції»"
      ctaLabel="Детальніше"
      ctaHref="/promo"
    />
  </div>
);

