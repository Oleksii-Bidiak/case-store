"use client";

import { useId } from "react";
import type { MyDevice } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import {
  updateMyDevicesSettings,
  useMyDevicesSettings,
} from "../model/my-devices-settings";
import { FOCUS_RING } from "./styles";

/** How many saved devices the «для всіх» hint names as its example. */
const HINT_EXAMPLE_DEVICES = 2;

function SwitchRow({
  title,
  hint,
  checked,
  disabled = false,
  onToggle,
  className,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;
  return (
    // The whole row is the switch's hit area: a <label> forwards a click on
    // its text to the button it labels (one accessible control).
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-4 py-3",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          id={titleId}
          className={cn(
            "block text-base font-semibold",
            disabled ? "text-disabled-foreground" : "text-foreground",
          )}
        >
          {title}
        </span>
        <span
          id={hintId}
          className={cn(
            "mt-0.5 block text-sm leading-normal",
            disabled ? "text-disabled-foreground" : "text-muted-foreground",
          )}
        >
          {hint}
        </span>
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={titleId}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "relative h-8 w-13 shrink-0 rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none",
          disabled
            ? "cursor-not-allowed bg-disabled"
            : checked
              ? "bg-primary"
              : "bg-muted",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.75 left-0.75 size-6.5 rounded-full bg-card shadow-card transition-transform duration-150 ease-out motion-reduce:transition-none",
            checked && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}

/**
 * The catalogue defaults (MyDevices.dc.html `.md-settings`): «лише сумісне»
 * (default on) and «для всіх моїх пристроїв» (default off, disabled while the
 * first is off — shown unchecked then, the stored value kept).
 */
export function MyDevicesSettingsPanel({
  devices,
}: {
  devices: readonly MyDevice[];
}) {
  const t = dict.devicePages.manager;
  const settings = useMyDevicesSettings();
  const scopeAll = settings.compatOnly && settings.compatScope === "all";
  const example = devices
    .slice(0, HINT_EXAMPLE_DEVICES)
    .map((device) => t.deviceWithLabel(device.name, device.label))
    .join(", ");

  const scopeHint = !settings.compatOnly
    ? t.scopeAllHintDisabled
    : scopeAll
      ? t.scopeAllHintOn(devices.length, example)
      : t.scopeAllHintOff;

  return (
    <div
      role="group"
      aria-label={t.settingsAria}
      className="mt-6 mb-2 flex flex-col overflow-hidden rounded-lg bg-card px-5 py-1.5 shadow-card"
    >
      <SwitchRow
        title={t.compatOnlyTitle}
        hint={t.compatOnlyHint}
        checked={settings.compatOnly}
        onToggle={() =>
          updateMyDevicesSettings({ compatOnly: !settings.compatOnly })
        }
      />
      <SwitchRow
        className="border-t border-border"
        title={t.scopeAllTitle}
        hint={scopeHint}
        checked={scopeAll}
        disabled={!settings.compatOnly}
        onToggle={() =>
          updateMyDevicesSettings({
            compatScope: settings.compatScope === "all" ? "active" : "all",
          })
        }
      />
    </div>
  );
}
