"use client";

import { DeviceHero, type DeviceHeroPicks } from "@/widgets/device-hero";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict } from "@/shared/config";
import { ProductCard } from "@/shared/ui";

/**
 * The homepage's first block (TASK-1952): the device picker — or, once a
 * device is saved, its panel — with the panel's product rail filled with
 * catalogue cards. Composed here because the cards' buy / wishlist / quick
 * view actions are widgets of their own (FSD: no widget → widget import), and
 * because a render function cannot cross from the server page into the client
 * `DeviceHero`.
 *
 * Device state is browser-local: the server renders the neutral picker, so
 * the ISR copy of `/` holds nothing personal.
 */
export function HomeDeviceHero({ className }: { className?: string }) {
  return <DeviceHero className={className} renderPicks={renderDevicePicks} />;
}

/**
 * Up to three cards that fit the active device. Below lg a snap rail: two
 * cards across, the third peeking (bleeding to the panel edge on a phone);
 * from lg, three columns beside the panel's text. The cell's right padding is
 * the gap, so two cells fill the row exactly without an arbitrary width.
 */
function renderDevicePicks({ device, products }: DeviceHeroPicks) {
  return (
    <ul
      aria-label={dict.home.devicePicksAria(device.name)}
      className="-mx-4 -my-3 flex snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 py-3 scrollbar-none md:mx-0 md:scroll-px-0 md:px-0 lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible"
    >
      {products.map((product) => (
        <li
          key={product.id}
          className="w-1/2 shrink-0 snap-start pr-3 lg:w-auto lg:pr-0"
        >
          <ProductCard
            product={product}
            imageSizes="(max-width: 639px) 244px, 260px"
            action={<ProductCardActions product={product} />}
            hoverAction={<ProductQuickViewTrigger product={product} />}
          />
        </li>
      ))}
    </ul>
  );
}
