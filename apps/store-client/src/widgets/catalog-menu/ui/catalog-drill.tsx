"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Smartphone } from "lucide-react";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { deviceHubHref, getDeviceFamilyTone } from "@/entities/device";
import { useMyDevices, useMyDevicesHydrated } from "@/entities/my-devices";
import { openDevicePicker } from "@/features/device-picker";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { CategoryIcon, Skeleton } from "@/shared/ui";
import {
  categoryHref,
  resolvePath,
  type CatalogNode,
} from "../model/category-tree";
import { FOCUS_RING, ICON_SQUARE } from "./menu-styles";

const t = dict.catalogMenu.drill;

const ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-menu py-1 pr-2.5 text-left text-base font-medium text-foreground transition-colors hover:bg-muted";

export interface CatalogDrillProps {
  /** Close the host sheet — every link and the device picker call it. */
  onNavigate: () => void;
}

/** Where focus goes after the level changes (the old button is gone). */
type FocusTarget = { kind: "heading" } | { kind: "row"; id: string } | null;

/**
 * CatalogDrill — the catalog inside the menu sheet below `xl` (TASK-2072,
 * CatalogDrill mockup). It replaces the two-level accordion: level 1 is the
 * device row and the roots with their icons; a root with subcategories opens
 * the next level in place — «← батько», the heading, «Усі товари «…»» and the
 * children — down to level 4. A category without children is a link.
 *
 * Inline in the sheet's nav, not a nested dialog: Escape keeps closing the
 * sheet, and the sheet unmounting is what resets the drill to level 1.
 */
export function CatalogDrill({ onNavigate }: CatalogDrillProps) {
  const { data, isPending, isError } = useCategoryControllerGetCategoryTree();
  const roots = data?.data ?? [];

  const [pathIds, setPathIds] = useState<string[]>([]);
  const path = resolvePath(roots, pathIds);
  const current = path.at(-1);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const focusTarget = useRef<FocusTarget>(null);

  // Drilling removes the button that had focus; put it somewhere meaningful —
  // the new heading on the way in, the row we came from on the way out.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    if (target.kind === "heading") headingRef.current?.focus();
    else rowRefs.current[target.id]?.focus();
  }, [pathIds]);

  const drillInto = (node: CatalogNode) => {
    focusTarget.current = { kind: "heading" };
    setPathIds(path.map((p) => p.id).concat(node.id));
  };

  const back = () => {
    if (!current) return;
    focusTarget.current = { kind: "row", id: current.id };
    setPathIds(path.slice(0, -1).map((p) => p.id));
  };

  const openPicker = () => {
    onNavigate();
    openDevicePicker();
  };

  const renderRow = (node: CatalogNode, withIcon: boolean) => {
    const rowClass = cn(ROW, withIcon ? "pl-1" : "pl-3", FOCUS_RING);
    const icon = withIcon && (
      <span className={cn(ICON_SQUARE, "size-9")}>
        <CategoryIcon icon={node.icon} className="size-4.5" />
      </span>
    );
    const name = (
      <span className="min-w-0 flex-1 leading-snug">{node.name}</span>
    );
    return (
      <li key={node.id}>
        {node.children.length > 0 ? (
          <button
            ref={(el) => {
              rowRefs.current[node.id] = el;
            }}
            type="button"
            onClick={() => drillInto(node)}
            className={rowClass}
          >
            {icon}
            {name}
            <ChevronRight
              className="size-4.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        ) : (
          <Link
            ref={(el) => {
              rowRefs.current[node.id] = el;
            }}
            href={categoryHref(node)}
            onClick={onNavigate}
            className={rowClass}
          >
            {icon}
            {name}
          </Link>
        )}
      </li>
    );
  };

  if (current) {
    const backLabel =
      path.length === 1
        ? dict.header.catalogButton
        : path[path.length - 2].name;
    const trail = path
      .slice(0, -1)
      .map((node) => node.name)
      .join(t.trailSeparator);
    return (
      <div className="flex flex-col gap-1 text-foreground">
        <button
          type="button"
          onClick={back}
          aria-label={t.backAria(backLabel)}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-muted pr-3.5 pl-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent",
            FOCUS_RING,
          )}
        >
          <ChevronLeft className="size-4.5 shrink-0" aria-hidden="true" />
          {backLabel}
        </button>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className={cn(
            "mx-3 mt-2.5 mb-0.5 rounded-sm font-display text-xl leading-tight font-bold",
            FOCUS_RING,
          )}
        >
          {current.name}
        </h3>
        {path.length >= 2 && (
          <p className="mx-3 mb-1.5 text-xs text-muted-foreground">{trail}</p>
        )}
        <Link
          href={categoryHref(current)}
          onClick={onNavigate}
          className={cn(
            "flex min-h-12 items-center justify-between gap-3 rounded-menu bg-card px-3 text-base font-semibold text-foreground shadow-card transition-colors hover:bg-muted",
            FOCUS_RING,
          )}
        >
          {t.allProductsIn(current.name)}
        </Link>
        <ul className="flex flex-col gap-0.5">
          {current.children.map((child) => renderRow(child, false))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-foreground">
      <DeviceRow onNavigate={onNavigate} onOpenPicker={openPicker} />

      {isPending && (
        <div className="flex flex-col gap-1 px-3 py-1" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-menu" />
          ))}
        </div>
      )}

      {isError && (
        <p role="alert" className="px-3 py-2 text-sm text-destructive">
          {dict.catalog.categoriesError}
        </p>
      )}

      {!isPending && !isError && roots.length > 0 && (
        <>
          <p className="mx-3 my-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {dict.header.catalogButton}
          </p>
          <ul className="flex flex-col gap-0.5">
            {roots.map((root) => renderRow(root, true))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Level 1's first block: «Все для …» in the active device's family tone and
 * the way to the other devices — or, with none saved, the dashed «Оберіть
 * свій пристрій». The list is browser-local: until it is read, a box of the
 * pick button's height holds the place so the roots do not jump.
 */
function DeviceRow({
  onNavigate,
  onOpenPicker,
}: {
  onNavigate: () => void;
  onOpenPicker: () => void;
}) {
  const hydrated = useMyDevicesHydrated();
  const devices = useMyDevices();
  const device = devices[0];

  if (!hydrated) {
    return <div aria-hidden="true" className="mb-1.5 h-11" />;
  }

  if (!device) {
    return (
      <button
        type="button"
        onClick={onOpenPicker}
        className={cn(
          "mb-1.5 inline-flex min-h-11 w-full items-center gap-2 rounded-full border-chip border-dashed border-border bg-card px-3.5 text-sm font-semibold text-foreground hover:border-solid",
          FOCUS_RING,
        )}
      >
        <Smartphone className="size-4.5 shrink-0" aria-hidden="true" />
        {dict.devicePicker.bar.pick}
      </button>
    );
  }

  const tone = getDeviceFamilyTone(device.family);
  const others = devices.length - 1;
  return (
    <>
      <Link
        href={deviceHubHref(device.slug)}
        onClick={onNavigate}
        className={cn(
          "mb-1.5 flex min-h-13 items-center gap-2.5 rounded-pad px-3.5 text-base font-semibold text-foreground",
          tone.surface,
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-2.5 shrink-0 rounded-full", tone.strong)}
        />
        <span className="min-w-0 flex-1">{t.allFor(device.name)}</span>
        <ChevronRight
          className="size-4.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
      {/* 44px tall for the thumb; the negative top margin keeps the text
          where the mockup's 36px line puts it. */}
      <button
        type="button"
        onClick={onOpenPicker}
        className={cn(
          "-mt-1.5 mb-0.5 min-h-11 self-start rounded-sm px-1.5 text-sm font-semibold text-muted-foreground underline hover:text-foreground",
          FOCUS_RING,
        )}
      >
        {others > 0 ? t.otherDevices(others) : t.addAnother}
      </button>
    </>
  );
}
