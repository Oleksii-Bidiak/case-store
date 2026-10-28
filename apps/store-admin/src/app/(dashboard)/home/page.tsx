import { Suspense } from "react";
import type { Metadata } from "next";
import { HomeBlockList, HomeBlockListSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * «Головна» — the homepage blocks (plan 186, TASK-662). Rendered on request: every
 * admin route sits behind auth, so there is no static payload worth keeping.
 *
 * The heading and «Додати блок» live in the widget: the button is gated by
 * `home:write`, which only a client component can read. TASK-670 passes the
 * «Подивитись на сайті» action through `previewAction`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.homeScreen.metaTitle,
};

export default function HomePage() {
  return (
    <Suspense fallback={<HomeBlockListSkeleton />}>
      <HomeBlockList />
    </Suspense>
  );
}
