"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, Smartphone, Tablet, Watch } from "lucide-react";
import { getDeviceFamilyTone, type DeviceFamily } from "@/entities/device";
import { MAX_DEVICE_LABEL_LENGTH, type MyDevice } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { myDeviceHubPath } from "../model/group-devices";
import { FOCUS_RING, PILL, PILL_PRIMARY, TEXT_ACTION } from "./styles";

/** Which control of a card should take focus after a change re-renders it. */
export type CardFocusTarget = "hub" | "labelToggle";

export interface MyDeviceCardProps {
  device: MyDevice;
  isActive: boolean;
  /** Compatible products (GET /device-models), `null` while unknown. */
  productCount: number | null;
  editing: boolean;
  suggestions: readonly string[];
  /** Set by the manager: focus this control once rendered (survives a regroup). */
  focusTarget: CardFocusTarget | null;
  focusSeq: number;
  onActivate: () => void;
  onStartEdit: () => void;
  onSaveLabel: (label: string) => void;
  onCancelEdit: () => void;
  onForget: () => void;
}

function FamilyGlyph({
  family,
  className,
}: {
  family: DeviceFamily | null;
  className?: string;
}) {
  const Icon =
    family === "watch" ? Watch : family === "ipad" ? Tablet : Smartphone;
  return <Icon aria-hidden="true" className={className} />;
}

/**
 * One saved device (MyDevices.dc.html `.md-card`): the family-toned band with
 * the model and how many products fit, then «Показувати для нього» (not on
 * the active one), «Все для <модель> →», and «Підписати» / «Забути» — or the
 * inline label editor while editing.
 */
export function MyDeviceCard({
  device,
  isActive,
  productCount,
  editing,
  suggestions,
  focusTarget,
  focusSeq,
  onActivate,
  onStartEdit,
  onSaveLabel,
  onCancelEdit,
  onForget,
}: MyDeviceCardProps) {
  const t = dict.devicePages.manager;
  const tone = getDeviceFamilyTone(device.family);
  const nameId = useId();
  const hubRef = useRef<HTMLAnchorElement>(null);
  const labelToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusTarget === "hub") hubRef.current?.focus();
    else if (focusTarget === "labelToggle") labelToggleRef.current?.focus();
  }, [focusTarget, focusSeq]);

  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        "flex flex-col overflow-hidden rounded-card border-2 bg-card shadow-card",
        isActive ? "border-foreground" : "border-transparent",
      )}
    >
      <div className={cn("flex items-center gap-3 p-4", tone.surface)}>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full text-footer",
            tone.strong,
          )}
        >
          <FamilyGlyph family={device.family} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={nameId}
            className="truncate text-base font-bold text-foreground"
            title={device.name}
          >
            {device.name}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {productCount === null
              ? t.cardMetaNoCount(device.brandName)
              : t.cardMeta(device.brandName, productCount)}
          </p>
        </div>
        {isActive && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground py-0.75 pr-2.5 pl-2 text-xs font-bold text-background">
            <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
            {t.active}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <div className="flex flex-wrap gap-2">
          {!isActive && (
            <button
              type="button"
              className={PILL_PRIMARY}
              aria-label={t.showForItAria(device.name)}
              onClick={onActivate}
            >
              {t.showForIt}
            </button>
          )}
          <Link
            ref={hubRef}
            href={myDeviceHubPath(device.slug)}
            className={cn(PILL, "max-w-full min-w-0")}
          >
            <span className="truncate">{t.allForIt(device.name)}</span>
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        </div>

        {editing ? (
          <LabelEditor
            initial={device.label ?? ""}
            suggestions={suggestions}
            onSave={onSaveLabel}
            onCancel={onCancelEdit}
          />
        ) : (
          <div className="flex gap-3.5">
            <button
              ref={labelToggleRef}
              type="button"
              className={TEXT_ACTION}
              aria-label={
                device.label
                  ? t.relabelAria(device.name)
                  : t.labelAria(device.name)
              }
              onClick={onStartEdit}
            >
              {device.label ? t.relabel : t.label}
            </button>
            <button
              type="button"
              className={TEXT_ACTION}
              aria-label={t.forgetAria(device.name)}
              onClick={onForget}
            >
              {t.forget}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * The inline label editor. Seeded once from the saved label when editing
 * starts (a mount, not an async prop — forms.md does not apply); Enter saves,
 * Escape cancels. A suggestion fills the field without saving.
 */
function LabelEditor({
  initial,
  suggestions,
  onSave,
  onCancel,
}: {
  initial: string;
  suggestions: readonly string[];
  onSave: (label: string) => void;
  onCancel: () => void;
}) {
  const t = dict.devicePages.manager;
  const [draft, setDraft] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSave(draft);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={MAX_DEVICE_LABEL_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.labelPlaceholder}
          aria-label={t.labelInputAria}
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 basis-40 rounded-full border-chip border-input bg-background px-3.5 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring motion-reduce:transition-none md:text-sm"
        />
        <button
          type="button"
          className={PILL_PRIMARY}
          onClick={() => onSave(draft)}
        >
          {t.labelSave}
        </button>
        <button type="button" className={PILL} onClick={onCancel}>
          {t.labelCancel}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div
          role="group"
          aria-label={t.labelSuggestionsAria}
          className="flex flex-wrap gap-1.5"
        >
          {suggestions.map((label) => (
            <button
              key={label}
              type="button"
              aria-label={t.labelSuggestionAria(label)}
              onClick={() => {
                setDraft(label);
                inputRef.current?.focus();
              }}
              className={cn(
                "inline-flex h-9 items-center rounded-full border border-border bg-background px-3 text-xs text-foreground transition-colors hover:bg-muted motion-reduce:transition-none",
                FOCUS_RING,
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
