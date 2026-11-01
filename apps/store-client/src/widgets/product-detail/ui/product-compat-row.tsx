"use client";

import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  CircleHelp,
  Smartphone,
} from "lucide-react";

import { getDeviceFamilyTone } from "@/entities/device";
import { openDevicePicker, type MyDevice } from "@/entities/my-devices";
import type { ProductGroupEntity } from "@/entities/product";
import {
  commonDeviceFamily,
  deviceHubHref,
  deviceShortDisplayName,
  deviceShortName,
  getDeviceFit,
  summarizeModelNames,
  useDeviceFit,
} from "@/features/device-fit";
import type { ProductCompatibleDeviceEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";

import { currentModelValue, findVariantFor } from "../model/model-variants";

/** How many other saved devices get their own answer line (Product mockup §6.3 f). */
const OTHER_DEVICES_LIMIT = 4;

// 40px pills (Product mockup `.pp-fbtn`): primary, and a ghost on the card
// surface. A press settles to 98 % unless the shopper asked for less motion.
const ACTION_BASE =
  "h-10 rounded-full px-4 text-sm font-semibold duration-150 ease-out active:scale-98 motion-reduce:transition-none motion-reduce:active:scale-100";
const ACTION_GHOST =
  "bg-card text-foreground hover:bg-card hover:text-foreground hover:shadow-card dark:hover:bg-card";

type RowState = "pending" | "ask" | "fits" | "variant" | "no-fit";

/** The sibling made for a device, when it is not the position on screen. */
interface VariantLink {
  slug: string;
  samePrice: boolean;
}

/**
 * ProductCompatRow — the PDP's big compatibility answer (TASK-1953), directly
 * under the title: does this product fit the shopper's active device?
 *
 *   - fits     — success tint, «Підходить до вашого …», «Інший пристрій»;
 *   - variant  — not this position, but the group has one for the device
 *                (state c): «Цей варіант — для …, не для …» and a primary
 *                «Обрати варіант для …» that opens that sibling;
 *   - no-fit   — neutral (never an alarm colour), «Не підходить до …», a link
 *                to everything for that device, «Інший пристрій»;
 *   - ask      — no saved device: the product's target models, «Обрати
 *                пристрій» (opens the one device picker, preset to the
 *                product's family). The family tone is used only here;
 *   - pending  — server render and hydration: the ask frame with its action
 *                row held empty, so the real answer replaces it in place.
 *
 * With several saved devices, «Ваші інші пристрої» answers for up to four
 * more — «Підходить», «Варіант для нього» (a link to that sibling; the
 * active device stays as it is) or «Не підходить». A product with no
 * compatibility data renders nothing — an empty list may mean "fits
 * anything" or "not mapped yet", and the row must not guess (the «na» state
 * needs a data contract the API does not have yet).
 */
export function ProductCompatRow({
  models,
  group = null,
  currentAttributes = null,
  currentSlug = "",
  currentPrice = "",
}: {
  /** `product.compatibleDeviceModels` from the PDP response. */
  models: readonly ProductCompatibleDeviceEntity[] | null | undefined;
  /** The product group — its model axis ties siblings to saved devices. */
  group?: ProductGroupEntity | null;
  currentAttributes?: Record<string, unknown> | null;
  currentSlug?: string;
  /** The position's price — «за тією ж ціною» only when a sibling matches it. */
  currentPrice?: string;
}) {
  const ids = (models ?? []).map((m) => m.id);
  const { hydrated, device, devices, verdict } = useDeviceFit(ids);

  if (!models?.length) return null;

  const variantFor = (d: MyDevice): VariantLink | null => {
    const sibling = findVariantFor(group, currentAttributes, d);
    if (!sibling || sibling.slug === currentSlug) return null;
    return {
      slug: sibling.slug,
      samePrice: Number(sibling.price) === Number(currentPrice),
    };
  };

  const activeVariant =
    device && verdict === "no-fit" ? variantFor(device) : null;

  const state: RowState = !hydrated
    ? "pending"
    : !device
      ? "ask"
      : activeVariant
        ? "variant"
        : (verdict ?? "ask");

  const { names, rest } = summarizeModelNames(models);
  const modelList = dict.deviceFit.row.modelsMore(names, rest);
  // «m.name» of the mockup: the model this position is made for.
  const currentModel = currentModelValue(group, currentAttributes) ?? modelList;
  const family = commonDeviceFamily(models);
  const askTone = getDeviceFamilyTone(family).surface;

  const copy = rowCopy(state, device, modelList, currentModel, activeVariant);
  const Icon =
    state === "fits"
      ? Check
      : state === "no-fit" || state === "variant"
        ? Ban
        : CircleHelp;
  const answered =
    state === "fits" || state === "no-fit" || state === "variant";

  const others = answered ? devices.slice(1, 1 + OTHER_DEVICES_LIMIT) : [];

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-menu",
            state === "fits"
              ? "bg-success text-success-foreground"
              : "bg-card text-muted-foreground",
          )}
        >
          <Icon className="size-5" strokeWidth={state === "fits" ? 2.5 : 2} />
        </span>
        {/* Announces the new answer when the active device changes. */}
        <div aria-live="polite" className="min-w-0 pt-0.5">
          <p
            className={cn(
              "text-base leading-snug font-bold",
              state === "fits" ? "text-success" : "text-foreground",
            )}
          >
            {copy.title}
          </p>
          <p className="mt-1 text-sm leading-normal text-muted-foreground">
            {copy.sub}
          </p>
        </div>
      </div>

      {/* Indented under the text at every width (mockup §6.3) — on a phone
          the two pills wrap with or without the indent. `min-h-10` holds the
          row while pending. */}
      <div className="mt-3 ml-14 flex min-h-10 flex-wrap gap-2">
        {state === "ask" && (
          <Button
            type="button"
            className={ACTION_BASE}
            onClick={() => openDevicePicker(family ? { family } : undefined)}
          >
            <Smartphone aria-hidden="true" />
            {dict.deviceFit.row.pickDevice}
          </Button>
        )}
        {state === "variant" && device && activeVariant && (
          <Button asChild className={ACTION_BASE}>
            <Link href={`/products/${activeVariant.slug}`} scroll={false}>
              <Check aria-hidden="true" />
              {dict.deviceFit.row.pickVariant(deviceShortName(device.name))}
            </Link>
          </Button>
        )}
        {state === "no-fit" && device && (
          <Button asChild className={ACTION_BASE}>
            <Link href={deviceHubHref(device.slug)}>
              {dict.deviceFit.row.allForDevice(deviceShortName(device.name))}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
        {answered && (
          <Button
            type="button"
            variant="ghost"
            className={cn(ACTION_BASE, ACTION_GHOST)}
            onClick={() => openDevicePicker()}
          >
            {dict.deviceFit.row.otherDevice}
            <ChevronDown aria-hidden="true" />
          </Button>
        )}
      </div>

      {others.length > 0 && (
        <div className="mt-3.5 ml-14 border-t border-foreground/10 pt-2.5">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            {dict.deviceFit.row.otherDevicesTitle}
          </p>
          <ul>
            {others.map((other) => (
              <OtherDeviceLine
                key={other.modelId}
                device={other}
                ids={ids}
                variant={variantFor(other)}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  );

  // The success tint is laid over the CARD surface (opaque), not over the
  // lavender page — the inner layer carries the tint, the outer the card.
  return (
    <section
      aria-label={dict.deviceFit.row.aria}
      data-state={state}
      className={cn(
        "rounded-lg",
        state === "fits" && "bg-card",
        (state === "no-fit" || state === "variant") && "bg-muted",
        (state === "ask" || state === "pending") && askTone,
      )}
    >
      <div
        className={cn("rounded-lg p-4", state === "fits" && "bg-success/13")}
      >
        {body}
      </div>
    </section>
  );
}

function rowCopy(
  state: RowState,
  device: MyDevice | null,
  modelList: string,
  currentModel: string,
  variant: VariantLink | null,
): { title: string; sub: string } {
  const row = dict.deviceFit.row;
  if (state === "fits" && device) {
    return {
      title: device.label
        ? row.fitsTitleLabelled(device.name, device.label)
        : row.fitsTitle(device.name),
      sub: row.fitsSub,
    };
  }
  if (state === "variant" && device && variant) {
    return {
      title: row.variantTitle(currentModel, deviceShortDisplayName(device)),
      sub: row.variantSub(device.name, variant.samePrice),
    };
  }
  if (state === "no-fit" && device) {
    return {
      title: row.noFitTitle(deviceShortDisplayName(device)),
      sub: row.noFitSub(modelList, deviceShortName(device.name)),
    };
  }
  return { title: row.askTitle(currentModel), sub: row.askSub };
}

function OtherDeviceLine({
  device,
  ids,
  variant,
}: {
  device: MyDevice;
  ids: readonly string[];
  variant: VariantLink | null;
}) {
  const fits = getDeviceFit(ids, device) === "fits";
  const name = deviceShortDisplayName(device);
  return (
    <li className="flex min-h-9 items-center gap-2.5 text-sm">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          getDeviceFamilyTone(device.family).strong,
        )}
      />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {!fits && variant ? (
        // Opens that device's sibling. The ACTIVE device does not change, so
        // the verdict above may then read «Цей варіант — для …, не для …».
        <Link
          href={`/products/${variant.slug}`}
          scroll={false}
          aria-label={dict.deviceFit.row.otherVariantAria(name)}
          className="shrink-0 rounded-sm text-xs font-semibold text-foreground underline underline-offset-3 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:text-primary motion-reduce:transition-none"
        >
          {dict.deviceFit.row.otherVariant}
        </Link>
      ) : (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-xs font-semibold",
            fits ? "text-success" : "text-muted-foreground",
          )}
        >
          {fits ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Ban aria-hidden="true" className="size-3.5" />
          )}
          {fits ? dict.deviceFit.row.otherFits : dict.deviceFit.row.otherNoFit}
        </span>
      )}
    </li>
  );
}
