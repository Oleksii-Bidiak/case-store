import type { Metadata } from "next";
import { MyDevicesManager } from "@/widgets/my-devices-manager";
import { dict, PAGE_CONTAINER } from "@/shared/config";

/**
 * `/devices` — «Мої пристрої» for a guest (TASK-2076). The list lives in this
 * browser only (localStorage), so the page is a static shell: the server
 * renders the skeleton and the client fills it in — nothing personal in the
 * HTML. A per-browser page has nothing to rank, hence `noindex` (links out to
 * the model hubs are still followed).
 */
export const metadata: Metadata = {
  title: dict.devicePages.manager.metaTitle,
  description: dict.devicePages.manager.metaDescription,
  robots: { index: false, follow: true },
};

export default function MyDevicesPage() {
  return (
    <div className={`${PAGE_CONTAINER} pt-6 pb-16`}>
      <MyDevicesManager shell="page" />
    </div>
  );
}
