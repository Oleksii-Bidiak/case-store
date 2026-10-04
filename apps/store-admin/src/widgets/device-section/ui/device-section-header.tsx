"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import {
  useAdminDeviceControllerFindBrands,
  useAdminDeviceControllerFindModels,
} from "@/entities/device";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Button, RegistryHeader, SectionTabs } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.devices;

/** The one-row request whose `meta.total` is the «Моделі» tab's count. */
export const MODELS_COUNT_QUERY = { page: 1, limit: 1 } as const;

interface DeviceSectionHeaderProps {
  active: "brands" | "models";
}

/**
 * «Пристрої» — ONE section with real page tabs «Бренди пристроїв · Моделі»
 * (wave 198, DevicesProposal ПР1/ПР5, TASK-1082), replacing the two headings
 * with a text «tab» beside each. Each tab is its own route, so they are links
 * with `aria-current` (`SectionTabs`); the sidebar item lights on both already
 * (`activePrefix: "/devices"`).
 *
 * The CTA is the active tab's own: «Додати бренд» opens the brand dialog over
 * the grid (`/devices/brands/new`), «Додати модель» the model form. Both need
 * `devices:write`, the key every admin device endpoint asks for.
 *
 * Counts are the API's own: the brands grid reads the complete list with no
 * arguments (this is the same request), and the models count is `meta.total`
 * of a one-row request.
 */
export function DeviceSectionHeader({ active }: DeviceSectionHeaderProps) {
  const { can } = useAuth();
  const canWrite = can(PERM.devicesWrite);
  const brands = useAdminDeviceControllerFindBrands();
  const models = useAdminDeviceControllerFindModels(MODELS_COUNT_QUERY);

  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.nav.devices}
        description={d.sectionDescription}
        actions={
          canWrite ? (
            <Button asChild>
              <Link
                href={
                  active === "brands"
                    ? "/devices/brands/new"
                    : "/devices/models/new"
                }
              >
                <PlusIcon aria-hidden="true" />
                {active === "brands" ? d.addBrand : d.addModel}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs
        label={d.sectionTabsAria}
        activeId={active}
        items={[
          {
            id: "brands",
            label: d.tabBrands,
            href: "/devices/brands",
            count: brands.data?.data.length,
          },
          {
            id: "models",
            label: d.tabModels,
            href: "/devices/models",
            count: models.data?.meta?.total,
          },
        ]}
      />
    </div>
  );
}
