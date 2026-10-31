"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { getDeviceFamilyTone } from "@/entities/device";
import {
  EMPTY_DEVICES,
  useMyDevices,
  useMyDevicesHydrated,
} from "@/entities/my-devices";
import type { ProductCompatibleDeviceEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import {
  deviceForModelValue,
  type ModelVariant,
} from "../model/model-variants";

const CHIP =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold";

/**
 * ProductCompatTab — the «Сумісність» tab's full answer (Product mockup §6.8):
 * every model this position fits (success chips) with the verification
 * note, then «Є варіанти для» — the group's other models as links to their
 * siblings. A model the shopper saved gets a family dot and its label; that
 * marking is client-only, after the device store hydrates.
 */
export function ProductCompatTab({
  models,
  variants,
}: {
  models: readonly ProductCompatibleDeviceEntity[];
  variants: readonly ModelVariant[];
}) {
  const hydrated = useMyDevicesHydrated();
  const saved = useMyDevices();
  const devices = hydrated ? saved : EMPTY_DEVICES;
  const copy = dict.deviceFit.tab;

  return (
    <div className="grid gap-4 rounded-card bg-card p-5 shadow-card md:grid-cols-2 md:p-7">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.fitsHeading}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {models.map((model) => (
            <li
              key={model.id}
              // The success tint lies over the card panel (opaque), as the
              // PDP row's does.
              className={cn(CHIP, "border-success bg-success/13 text-success")}
            >
              <Check
                aria-hidden="true"
                strokeWidth={2.5}
                className="size-3.5"
              />
              {model.name}
            </li>
          ))}
        </ul>
        <p className="text-sm leading-normal text-muted-foreground">
          {copy.note}
        </p>
      </section>

      {variants.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.variantsHeading}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const mine = deviceForModelValue(variant.model, devices);
              return (
                <li key={variant.model}>
                  <Link
                    href={`/products/${variant.slug}`}
                    scroll={false}
                    className={cn(
                      CHIP,
                      "border-border bg-background text-foreground no-underline transition-colors duration-150 hover:border-foreground/35 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                    )}
                  >
                    {mine && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          getDeviceFamilyTone(mine.family).strong,
                        )}
                      />
                    )}
                    {mine?.label
                      ? `${variant.model} · ${mine.label}`
                      : variant.model}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
