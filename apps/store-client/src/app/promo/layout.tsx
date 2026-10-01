import type { ReactNode } from "react";
import { PromoView } from "@/widgets/promo";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * The static frame of `/promo` (TASK-869): container, breadcrumb, hero,
 * coupons, the «Товари зі знижкою» heading and the subscribe block. The page
 * streams into the deals slot, so the segment's `loading.tsx` — which Next nests
 * INSIDE this layout — only has to stand in for the listing itself.
 *
 * Why a layout and not a copy of the hero in `loading.tsx`: the frame reads no
 * request data, so it paints for real the moment the route is entered, and it
 * is the same React tree before and after the page lands — the countdown does
 * not restart, the coupons query is not re-mounted, and a filter change on
 * `?category=` re-renders only the listing under it.
 */
export default function PromoLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${PAGE_CONTAINER} pt-5.5 pb-16`}>
      <PromoView deals={children} />
    </div>
  );
}
