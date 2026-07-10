"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useDeviceControllerFindBrands,
  useDeviceControllerFindModels,
} from "@/entities/device";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.home.modelPicker;

/**
 * ModelPicker — "find accessories for your device" selector under the hero
 * (TASK-190). Brand → model cascade backed by the device-taxonomy API: the
 * model select is disabled until a brand is chosen and its options are scoped to
 * that brand. Submitting navigates to the catalog filtered by the chosen device
 * model (`/products?deviceModelId=…`).
 */
export function ModelPicker() {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");

  const { data: brandsData, isLoading: brandsLoading } =
    useDeviceControllerFindBrands();
  const brands = brandsData?.data ?? [];

  const { data: modelsData, isLoading: modelsLoading } =
    useDeviceControllerFindModels(
      { deviceBrandId: brandId },
      { query: { enabled: Boolean(brandId) } },
    );
  const models = modelsData?.data ?? [];

  function handleBrandChange(nextBrandId: string) {
    setBrandId(nextBrandId);
    // Reset the model whenever the brand changes so a stale model can't submit.
    setModelId("");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!modelId) return;
    router.push(`/products?deviceModelId=${encodeURIComponent(modelId)}`);
  }

  const modelPlaceholder = !brandId
    ? t.modelPlaceholderEmpty
    : modelsLoading
      ? t.loading
      : t.modelPlaceholder;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="min-w-[12rem]">
        <p className="font-display text-base font-semibold text-foreground">
          {t.title}
        </p>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <Select value={brandId} onValueChange={handleBrandChange}>
        <SelectTrigger
          aria-label={t.brandAria}
          className="h-11 flex-1 basis-40 bg-background"
        >
          <SelectValue
            placeholder={brandsLoading ? t.loading : t.brandPlaceholder}
          />
        </SelectTrigger>
        <SelectContent>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={modelId}
        onValueChange={setModelId}
        disabled={!brandId || modelsLoading}
      >
        <SelectTrigger
          aria-label={t.modelAria}
          className="h-11 flex-1 basis-40 bg-background"
        >
          <SelectValue placeholder={modelPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" size="lg" disabled={!modelId} className="h-11">
        {t.submit}
      </Button>
    </form>
  );
}
