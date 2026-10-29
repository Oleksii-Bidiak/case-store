import { Suspense } from "react";
import type { Metadata } from "next";
import { HomeBlockList, HomeBlockListSkeleton } from "@/widgets";
import { SitePreviewButton } from "@/features/site-preview";
import { dict } from "@/shared/config";

/**
 * «Головна» — the homepage blocks (plan 186, TASK-662). Rendered on request: every
 * admin route sits behind auth, so there is no static payload worth keeping.
 *
 * The heading and «Додати блок» live in the widget: the button is gated by
 * `home:write`, which only a client component can read. «Подивитись на сайті»
 * (TASK-670) goes in through `previewAction` — always a signed preview here, never
 * a plain link: the homepage may carry scheduled and hidden blocks, and block
 * edits save one by one, so there is no unsaved form to ask about.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.homeScreen.metaTitle,
};

export default function HomePage() {
  return (
    <Suspense fallback={<HomeBlockListSkeleton />}>
      <HomeBlockList
        previewAction={
          <SitePreviewButton
            target={{ type: "home" }}
            description={dict.sitePreview.whatHome}
          />
        }
      />
    </Suspense>
  );
}
