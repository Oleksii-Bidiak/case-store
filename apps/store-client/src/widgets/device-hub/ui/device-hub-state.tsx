"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  addDevice,
  openDevicePicker,
  setActiveDevice,
  toMyDeviceInput,
  useDevicePickerState,
  useMyDevices,
  useMyDevicesHydrated,
  type MyDevice,
} from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import { deviceHubPath } from "../model/hub-copy";

/** The hub model fields the island reads (serialisable server → client). */
export interface HubStateModel {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  brandSlug: string;
  series: string | null;
}

export type HubDeviceState =
  | { kind: "active"; device: MyDevice }
  | { kind: "saved"; device: MyDevice }
  | { kind: "none" };

/** Where the model stands in «Мої пристрої»: the first device is the active one. */
export function getHubDeviceState(
  devices: readonly MyDevice[],
  modelId: string,
): HubDeviceState {
  const index = devices.findIndex((device) => device.modelId === modelId);
  if (index === 0) return { kind: "active", device: devices[0] };
  if (index > 0) return { kind: "saved", device: devices[index] };
  return { kind: "none" };
}

/** The kicker over the H1 for a state — «Apple · ваш активний пристрій». */
export function hubKickerText(
  state: HubDeviceState,
  model: Pick<HubStateModel, "brandName" | "series">,
): string {
  const t = dict.devicePages.hub;
  if (state.kind === "active") {
    return state.device.label
      ? t.kickerActiveLabelled(state.device.label)
      : t.kickerActive(model.brandName);
  }
  if (state.kind === "saved") {
    return t.kickerSaved(model.brandName, state.device.label);
  }
  return t.kickerNeutral(model.brandName, model.series);
}

function useHubDeviceState(modelId: string): HubDeviceState {
  return getHubDeviceState(useMyDevices(), modelId);
}

/**
 * The kicker text. Personal state lives in this browser only (localStorage,
 * TASK-2074), so the server — and the cached ISR HTML — always renders the
 * neutral «Apple · iPhone 15»; the client swaps in «ваш активний» after
 * hydration. A one-line text swap, no layout shift.
 */
export function DeviceHubKicker({ model }: { model: HubStateModel }) {
  const state = useHubDeviceState(model.id);
  return <>{hubKickerText(state, model)}</>;
}

const CTA_CLASS =
  "h-12 rounded-cta px-5 text-base font-semibold transition-all duration-200 ease-out hover:shadow-card active:scale-98 motion-reduce:transition-none motion-reduce:active:scale-100";

/**
 * The hero's ONE device-state element plus «Інша модель»:
 *  - active → a non-interactive «✓ Ваш активний пристрій» pill;
 *  - saved, not active → «Показувати для нього» (makes it active);
 *  - not saved → «Додати до моїх пристроїв» (adds AND makes it active).
 *
 * Until the store is read (server render, hydration) a same-size placeholder
 * holds the slot, so neither the wrong button nor a jump ever shows.
 *
 * «Інша модель» opens the single device picker; when the shopper then picks or
 * switches to another model, the page follows to THAT model's hub — on a page
 * about one model, choosing another one is a request to see it.
 */
export function DeviceHubActions({
  model,
  className,
}: {
  model: HubStateModel;
  className?: string;
}) {
  const t = dict.devicePages.hub;
  const router = useRouter();
  const devices = useMyDevices();
  const hydrated = useMyDevicesHydrated();
  const picker = useDevicePickerState();
  const state = getHubDeviceState(devices, model.id);
  const activeDevice = devices[0] ?? null;
  const activeId = activeDevice?.modelId ?? null;

  // Active model id when «Інша модель» was pressed; `undefined` = not waiting.
  const awaitingPickFrom = useRef<string | null | undefined>(undefined);
  // Set by our own buttons: move focus onto the pill that replaces them.
  const focusPillNext = useRef(false);
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (awaitingPickFrom.current === undefined) return;
    if (activeId !== awaitingPickFrom.current) {
      awaitingPickFrom.current = undefined;
      if (activeDevice && activeDevice.slug !== model.slug) {
        router.push(deviceHubPath(activeDevice.slug));
      }
      return;
    }
    if (!picker.open) awaitingPickFrom.current = undefined;
  }, [activeId, activeDevice, picker.open, model.slug, router]);

  useEffect(() => {
    if (state.kind === "active" && focusPillNext.current) {
      focusPillNext.current = false;
      pillRef.current?.focus();
    }
  }, [state.kind]);

  const pickAnother = () => {
    awaitingPickFrom.current = activeId;
    openDevicePicker();
  };

  let stateElement: ReactNode;
  if (!hydrated) {
    stateElement = (
      <span
        aria-hidden="true"
        className="inline-block h-12 w-60 rounded-full bg-card/60"
      />
    );
  } else if (state.kind === "active") {
    stateElement = (
      <span
        ref={pillRef}
        tabIndex={-1}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-card/70 px-4.5 text-base font-semibold text-success outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
        {t.activeState}
      </span>
    );
  } else if (state.kind === "saved") {
    stateElement = (
      <Button
        type="button"
        className={CTA_CLASS}
        onClick={() => {
          focusPillNext.current = true;
          setActiveDevice(model.id);
        }}
      >
        <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
        {t.showForIt}
      </Button>
    );
  } else {
    stateElement = (
      <Button
        type="button"
        className={CTA_CLASS}
        onClick={() => {
          focusPillNext.current = true;
          addDevice(toMyDeviceInput(model));
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
        {t.addToMine}
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {stateElement}
      <Button
        type="button"
        variant="ghost"
        aria-haspopup="dialog"
        onClick={pickAnother}
        className={cn(
          CTA_CLASS,
          "bg-card text-foreground hover:-translate-y-px hover:bg-card motion-reduce:hover:translate-y-0",
        )}
      >
        {t.otherModel}
        <ChevronDown aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
