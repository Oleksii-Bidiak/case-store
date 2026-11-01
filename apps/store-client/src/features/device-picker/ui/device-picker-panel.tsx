"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { CircleHelp, Search, X } from "lucide-react";

import { matchDeviceModels, type DeviceModelCatalog } from "@/entities/device";
import {
  addDevice,
  clearMyDevices,
  closeDevicePicker,
  readMyDevices,
  removeDevice,
  setActiveDevice,
  toMyDeviceInput,
  useMyDevices,
  type DevicePickerRequest,
  type MyDevice,
} from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { DialogClose, DialogDescription, DialogTitle } from "@/shared/ui";

import {
  SEARCH_RESULT_LIMIT,
  withFamily,
  type PickerModel,
} from "../model/picker-models";
import { CatalogStatus, ModelBrowser } from "./model-browser";
import { ModelSearchResults } from "./model-search-results";
import { FOCUS_RING, KICKER, isDialogLayout } from "./picker-styles";
import { SavedDevices } from "./saved-devices";

const t = dict.devicePicker.dialog;

interface DevicePickerPanelProps {
  request: DevicePickerRequest;
  catalog: DeviceModelCatalog;
  /** Owned by the shell so it can focus the field on open (≥ 640). */
  searchInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The picker's content. Mounted fresh on every open (the dialog unmounts its
 * content when closed), so the query, tab, help and «show all» state start
 * from the open request each time. Every choice applies at once — there is
 * no «Зберегти».
 */
export function DevicePickerPanel({
  request,
  catalog,
  searchInputRef,
}: DevicePickerPanelProps) {
  const devices = useMyDevices();
  const [query, setQuery] = useState(request.query ?? "");
  const [expanded, setExpanded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const helpId = useId();

  const models = useMemo(() => withFamily(catalog.models), [catalog.models]);
  const productCountById = useMemo(
    () => new Map(models.map((m) => [m.id, m.productCount])),
    [models],
  );
  const savedIds = useMemo(
    () => new Set(devices.map((d) => d.modelId)),
    [devices],
  );

  // ≤ 200 models — matching on every keystroke is cheap, no deferral.
  const trimmed = query.trim();
  const results = useMemo(
    () =>
      trimmed
        ? matchDeviceModels(trimmed, models, { limit: SEARCH_RESULT_LIMIT })
        : [],
    [trimmed, models],
  );

  // Move focus onto «Так, забути всі» when the confirm step appears.
  useEffect(() => {
    if (confirmClear) confirmRef.current?.focus();
  }, [confirmClear]);

  const hasDevices = devices.length > 0;
  const searching = trimmed !== "";

  // The opener may go on from here (the homepage hero opens the hub) —
  // told after the store is written and the picker is closed.
  const notifyChosen = () => {
    const active = readMyDevices()[0];
    if (active) request.onChoose?.(active);
  };

  const choose = (model: PickerModel) => {
    addDevice(toMyDeviceInput(model));
    closeDevicePicker();
    notifyChosen();
  };

  const activate = (modelId: string) => {
    setActiveDevice(modelId);
    closeDevicePicker();
    notifyChosen();
  };

  // The control that had focus is gone with its row — park focus somewhere
  // stable. Dialog (≥ 640): the search field, ready for the next model.
  // Sheet: the title — focusing the field there would pop the on-screen
  // keyboard over the sheet after every ✕.
  const parkFocus = () => {
    if (isDialogLayout()) searchInputRef.current?.focus();
    else titleRef.current?.focus();
  };

  const forget = (device: MyDevice) => {
    removeDevice(device.modelId);
    setAnnouncement(t.forgotten(device.name));
    parkFocus();
  };

  const forgetAll = () => {
    clearMyDevices();
    setConfirmClear(false);
    setExpanded(false);
    setAnnouncement(t.forgottenAll);
    parkFocus();
  };

  return (
    <>
      {/* Grab handle — a bottom-sheet affordance, decorative. */}
      <span
        aria-hidden="true"
        className="mx-auto h-1.5 w-11 shrink-0 rounded-full bg-border sm:hidden"
      />
      <DialogClose
        aria-label={t.close}
        className={cn(
          "absolute top-3.5 right-3.5 grid size-11 place-items-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent",
          FOCUS_RING,
        )}
      >
        <X aria-hidden="true" className="size-4.5" />
      </DialogClose>

      {/* Programmatic focus target only (tabIndex -1), never tabbed to. */}
      <DialogTitle
        ref={titleRef}
        tabIndex={-1}
        className="mt-1.5 mr-14 font-display text-xl leading-tight font-bold tracking-tight text-foreground outline-none sm:mt-0 sm:text-2xl"
      >
        {hasDevices ? t.titleSaved(devices.length) : t.titleEmpty}
      </DialogTitle>
      <DialogDescription className="-mt-1.5 text-sm leading-normal text-muted-foreground">
        {hasDevices ? t.ledeSaved : t.ledeEmpty}
      </DialogDescription>

      {hasDevices && (
        <>
          <SavedDevices
            devices={devices}
            productCountById={productCountById}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
            onActivate={activate}
            onForget={forget}
            onNavigate={closeDevicePicker}
          />
          <p className={cn(KICKER, "mt-1 -mb-1")}>{t.addAnother}</p>
        </>
      )}

      <div className="flex h-13 shrink-0 items-center gap-2.5 rounded-full border-chip border-input bg-background pr-1 pl-4.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <Search
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        {/* The pill's focus-within border is the field's focus indicator. */}
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter picks the highlighted (first) result.
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              choose(results[0].model);
            }
          }}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchAria}
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          // The native WebKit clear «×» would duplicate «Очистити пошук».
          className="h-full min-w-0 flex-1 appearance-none bg-transparent [&::-webkit-search-cancel-button]:appearance-none text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            aria-label={t.clearSearch}
            onClick={() => {
              setQuery("");
              searchInputRef.current?.focus();
            }}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden="true" className="size-4.5" />
          </button>
        )}
      </div>

      {models.length === 0 && (catalog.isLoading || catalog.isError) ? (
        <CatalogStatus
          isError={catalog.isError}
          onRetry={catalog.retry}
          compact={searching}
        />
      ) : searching ? (
        <ModelSearchResults
          query={trimmed}
          results={results}
          savedIds={savedIds}
          onChoose={choose}
          onNavigate={closeDevicePicker}
        />
      ) : (
        <ModelBrowser
          models={models}
          savedIds={savedIds}
          initialFamily={request.family}
          onChoose={choose}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3">
        <button
          type="button"
          aria-expanded={helpOpen}
          aria-controls={helpId}
          onClick={() => setHelpOpen((v) => !v)}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <CircleHelp aria-hidden="true" className="size-4.5" />
          {t.helpToggle}
        </button>
        {hasDevices &&
          (confirmClear ? (
            <span className="flex flex-wrap items-center gap-x-4">
              <button
                ref={confirmRef}
                type="button"
                onClick={forgetAll}
                className={cn(
                  "min-h-11 rounded-sm text-sm font-semibold text-foreground underline underline-offset-3",
                  FOCUS_RING,
                )}
              >
                {t.forgetAllConfirm(devices.length)}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className={cn(
                  "min-h-11 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {t.forgetAllCancel}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className={cn(
                "min-h-11 rounded-sm text-sm font-semibold text-muted-foreground underline underline-offset-3 transition-colors hover:text-foreground",
                FOCUS_RING,
              )}
            >
              {t.forgetAll}
            </button>
          ))}
      </div>

      {helpOpen && (
        <div
          id={helpId}
          className="flex flex-col gap-1 rounded-pad bg-muted px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          {t.help.map((item) => (
            <p key={item.lead}>
              <strong>{item.lead}</strong> {item.body}
            </p>
          ))}
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
