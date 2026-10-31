"use client";

import { useRef } from "react";
import { Ban, Check } from "lucide-react";
import { AddToCartButton } from "@/features/add-to-cart";
import { deviceShortName, useDeviceFit } from "@/features/device-fit";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { useMobileBarInset } from "@/shared/lib/use-mobile-bar-inset";
import { ProductInCartButton } from "./product-in-cart-button";

interface MobileAtcBarProps {
  productId: string;
  productName: string;
  price: string;
  inStock: boolean;
  /** The cart already holds this position — read by the view from `useGetCart`. */
  inCart: boolean;
  /** Opens the mini-cart; the same handler as the buy box's «В кошику». */
  onOpenCart: () => void;
  /** `product.compatibleDeviceModels` ids — drive the compact verdict. */
  compatibleDeviceModelIds?: readonly string[];
}

/**
 * MobileAtcBar — a sticky bottom bar shown below `lg` (where the info column
 * sits under the gallery) with the current price and the primary cart action, so it is always within thumb
 * reach while the shopper scrolls the description. The page adds bottom
 * padding so this never covers content.
 *
 * It mirrors the buy box's cart state (TASK-874): «Купити» while the position
 * is not in the cart, «В кошику» (or «Товар закінчився») once it is — the view
 * owns the cart read and hands the answer to both.
 *
 * Under the price, a compatibility product gets a one-line verdict for the
 * active device (Product mockup §6.7): «Підходить до …» in `success`, or
 * «Не для …» in `muted-foreground` — never an alarm colour. Client-only, after
 * the device store hydrates; nothing without a saved device.
 *
 * It publishes its measured height while mounted (TASK-1771), so below `lg` the
 * global toaster stacks above it — the «Купити» toast no longer covers the very
 * button that raised it (WCAG 2.4.11).
 */
export function MobileAtcBar({
  productId,
  productName,
  price,
  inStock,
  inCart,
  onOpenCart,
  compatibleDeviceModelIds,
}: MobileAtcBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  useMobileBarInset(barRef);
  const { device, verdict } = useDeviceFit(compatibleDeviceModelIds);
  const short = device ? deviceShortName(device.name) : "";

  return (
    <div
      ref={barRef}
      data-testid="mobile-atc-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/94 px-4 py-2.5 backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex max-w-page items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg leading-tight font-bold tracking-tight text-foreground tabular-nums">
            {formatMoney(price)}
          </span>
          {verdict && device && (
            <small
              data-slot="mobile-atc-fit"
              data-verdict={verdict}
              className={`flex min-w-0 items-center gap-1 text-xs ${
                verdict === "fits" ? "text-success" : "text-muted-foreground"
              }`}
            >
              {verdict === "fits" ? (
                <Check
                  aria-hidden="true"
                  strokeWidth={2.5}
                  className="size-3 shrink-0"
                />
              ) : (
                <Ban aria-hidden="true" className="size-3 shrink-0" />
              )}
              <span className="truncate">
                {verdict === "fits"
                  ? dict.deviceFit.fits(short)
                  : dict.deviceFit.notFor(short)}
              </span>
            </small>
          )}
        </div>
        <div className="shrink-0">
          {inCart ? (
            <ProductInCartButton
              productName={productName}
              inStock={inStock}
              onOpenCart={onOpenCart}
              compact
            />
          ) : (
            <AddToCartButton
              productId={productId}
              outOfStock={!inStock}
              compact
              className="h-12 px-5.5 text-base"
            />
          )}
        </div>
      </div>
    </div>
  );
}
