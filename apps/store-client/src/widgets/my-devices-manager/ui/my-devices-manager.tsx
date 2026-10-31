"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useDeviceModelCatalog } from "@/entities/device";
import {
  addDevice,
  openDevicePicker,
  readMyDevices,
  removeDevice,
  setActiveDevice,
  setLabel,
  useMyDevices,
  useMyDevicesHydrated,
  type MyDevice,
} from "@/entities/my-devices";
import { dict, H1_CLASS } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { groupDevicesByLabel, labelSuggestions } from "../model/group-devices";
import { MyDeviceCard, type CardFocusTarget } from "./my-device-card";
import { MyDevicesSettingsPanel } from "./my-devices-settings-panel";
import { MyDevicesSkeleton } from "./my-devices-skeleton";
import { ADD_CTA, FOCUS_RING } from "./styles";

export interface MyDevicesManagerProps {
  /**
   * `page` — the guest route `/devices` (own crumbs); `account` — the account
   * section, inside AccountShell, whose menu is the navigation.
   */
  shell: "page" | "account";
}

/**
 * Device cards: one column on a phone, then as many ≥ 280px columns as the
 * block's OWN width holds (container queries) — 4 on the 1320px page, 3 in
 * the narrower account column — like the mockup's `auto-fill, minmax(280px)`.
 */
const GRID =
  "grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4";

type FocusRequest = { id: string; target: CardFocusTarget; seq: number };

/**
 * «Мої пристрої» (TASK-2076, MyDevices.dc.html) — one block, two shells.
 *
 * Everything here is this browser's localStorage (`my-devices:v1` and
 * `my-devices-settings:v1`); account sync is TASK-1959. The server and the
 * hydration render draw a skeleton, so the empty state never flashes before
 * the list is read.
 */
export function MyDevicesManager({ shell }: MyDevicesManagerProps) {
  const t = dict.devicePages.manager;
  const devices = useMyDevices();
  const hydrated = useMyDevicesHydrated();
  const { models } = useDeviceModelCatalog({
    enabled: hydrated && devices.length > 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const counts = useMemo(
    () => new Map(models.map((model) => [model.id, model.productCount])),
    [models],
  );
  const groups = useMemo(() => groupDevicesByLabel(devices), [devices]);
  const suggestions = useMemo(
    () => labelSuggestions(devices, t.labelDefaults),
    [devices, t.labelDefaults],
  );

  const activeId = devices[0]?.modelId ?? null;
  const hasDevices = hydrated && devices.length > 0;
  const isEmpty = hydrated && devices.length === 0;

  const requestFocus = (id: string, target: CardFocusTarget) =>
    setFocus((prev) => ({ id, target, seq: (prev?.seq ?? 0) + 1 }));

  const activate = (device: MyDevice) => {
    setActiveDevice(device.modelId);
    // The pressed button disappears on the now-active card — land on its link.
    requestFocus(device.modelId, "hub");
  };

  const saveLabel = (device: MyDevice, label: string) => {
    setLabel(device.modelId, label);
    setEditingId(null);
    // The card may move to another group (a remount) — the request follows it.
    requestFocus(device.modelId, "labelToggle");
  };

  const cancelEdit = (device: MyDevice) => {
    setEditingId(null);
    requestFocus(device.modelId, "labelToggle");
  };

  const forget = (device: MyDevice) => {
    const wasActive = readMyDevices()[0]?.modelId === device.modelId;
    removeDevice(device.modelId);
    if (editingId === device.modelId) setEditingId(null);
    headingRef.current?.focus();
    toast(t.forgotten(device.name), {
      action: {
        label: t.undo,
        onClick: () => {
          // Re-adding makes a device active; give that back to whichever
          // device is active NOW unless the forgotten one was.
          const activeNow = readMyDevices()[0]?.modelId;
          addDevice({
            modelId: device.modelId,
            slug: device.slug,
            name: device.name,
            brandName: device.brandName,
            family: device.family,
            ...(device.label ? { label: device.label } : {}),
          });
          if (!wasActive && activeNow) setActiveDevice(activeNow);
        },
      },
    });
  };

  const addButton = (className?: string) => (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => openDevicePicker()}
      className={cn(ADD_CTA, className)}
    >
      <Plus aria-hidden="true" className="size-4.5" />
      {t.add}
    </button>
  );

  return (
    <div className="@container">
      {shell === "page" && (
        <nav
          aria-label={dict.product.breadcrumbAria}
          className="mb-4.5 flex items-center gap-2.5 text-sm text-muted-foreground"
        >
          <Link
            href="/"
            className={cn(
              "rounded-sm underline-offset-3 transition-colors hover:text-foreground hover:underline",
              FOCUS_RING,
            )}
          >
            {t.crumbHome}
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
          <span aria-current="page" className="font-medium text-foreground">
            {t.title}
          </span>
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className={`${H1_CLASS} text-foreground outline-none`}
          >
            {hasDevices ? t.titleWithCount(devices.length) : t.title}
          </h1>
          <p className="mt-2 max-w-160 text-base leading-relaxed text-muted-foreground">
            {t.lede}
          </p>
        </div>
        {/* The empty card carries the one primary when the list is empty. */}
        {hasDevices && addButton("w-full sm:w-auto")}
        {!hydrated && (
          <div
            aria-hidden="true"
            className="h-12 w-full rounded-cta bg-muted motion-safe:animate-pulse sm:w-48"
          />
        )}
      </div>

      {!hydrated && <MyDevicesSkeleton />}

      {isEmpty && (
        <div className="mt-7 flex flex-col items-center gap-3.5 rounded-card bg-card px-5 py-12 text-center shadow-card">
          <span
            aria-hidden="true"
            className="flex size-18 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Smartphone className="size-6" />
          </span>
          <h2 className="font-display text-xl font-bold text-foreground">
            {t.emptyTitle}
          </h2>
          <p className="max-w-110 text-base leading-relaxed text-muted-foreground">
            {t.emptyBody}
          </p>
          {addButton()}
        </div>
      )}

      {hasDevices && (
        <>
          <MyDevicesSettingsPanel devices={devices} />
          {groups.map((group) => {
            const name = group.label ?? t.groupMine;
            return (
              <section key={group.key} aria-label={name} className="mt-7">
                <h2 className="mb-3 flex items-baseline gap-2.5 font-display text-xl font-bold text-foreground">
                  {name}
                  <small className="font-sans text-sm font-medium text-muted-foreground">
                    {t.deviceCount(group.devices.length)}
                  </small>
                </h2>
                <div className={GRID}>
                  {group.devices.map((device) => (
                    <MyDeviceCard
                      key={device.modelId}
                      device={device}
                      isActive={device.modelId === activeId}
                      productCount={counts.get(device.modelId) ?? null}
                      editing={editingId === device.modelId}
                      suggestions={suggestions}
                      focusTarget={
                        focus?.id === device.modelId ? focus.target : null
                      }
                      focusSeq={focus?.seq ?? 0}
                      onActivate={() => activate(device)}
                      onStartEdit={() => setEditingId(device.modelId)}
                      onSaveLabel={(label) => saveLabel(device, label)}
                      onCancelEdit={() => cancelEdit(device)}
                      onForget={() => forget(device)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
