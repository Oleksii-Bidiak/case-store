"use client";

import { ErrorState } from "@/shared/ui";
import { dict } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import {
  useGetDeliverySettings,
  useListAdminPickupPoints,
} from "@/entities/delivery";
import { DeliverySettingsForm } from "@/features/delivery-settings-form";
import {
  DeliverySettingsHeading,
  DeliverySettingsSkeleton,
} from "./delivery-settings-skeleton";
import { PickupPointsPanel } from "./pickup-points-panel";

/**
 * /settings/delivery (TASK-644, mockup Д-н2 SettingsDelivery).
 *
 * The heading is always drawn; below it, one of: the refusal (ДН-1.10) for a
 * session without `settings:delivery` — rendered by `PermissionGate`, which
 * also keeps the two queries below from ever being sent as guaranteed 403s —
 * the skeleton (ДН-1.9), a load failure with «Повторити», or the form.
 */
export function DeliverySettingsView() {
  const t = dict.deliverySettings;
  return (
    <div className="flex flex-col gap-6">
      <DeliverySettingsHeading />
      <PermissionGate
        permission={PERM.settingsDelivery}
        title={t.noAccessTitle}
        hint={t.noAccessHint}
      >
        <DeliverySettingsContent />
      </PermissionGate>
    </div>
  );
}

function DeliverySettingsContent() {
  const settings = useGetDeliverySettings();
  // The pickup preview row and the «немає активних точок» warning need the
  // ACTIVE count. Its failure does not block the page: the count is then
  // unknown and both stay hidden rather than guessing.
  const points = useListAdminPickupPoints();
  const activePickupPoints = points.data
    ? points.data.data.filter((point) => point.isActive).length
    : null;

  if (settings.isLoading) return <DeliverySettingsSkeleton />;

  if (settings.isError || !settings.data?.data) {
    return (
      <ErrorState
        message={dict.deliverySettings.loadError}
        onRetry={() => void settings.refetch()}
        isRetrying={settings.isFetching}
      />
    );
  }

  return (
    <DeliverySettingsForm
      settings={settings.data.data}
      activePickupPoints={activePickupPoints}
      // TASK-645: the point list lives in the pickup card. A slot, because
      // the form and the point editor are sibling features.
      pickupPoints={<PickupPointsPanel />}
    />
  );
}
