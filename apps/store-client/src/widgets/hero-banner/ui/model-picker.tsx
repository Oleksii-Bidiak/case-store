"use client";

import { useState } from "react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const { brands, models } = dict.home.modelPicker;

/**
 * ModelPicker — "find accessories for your device" selector under the hero.
 *
 * UI-only stub: the products API has no device-model filter yet, so submitting
 * does nothing. The button stays disabled until both a brand and a model are
 * chosen, so the control never looks broken. Wire this up once the backend
 * exposes model→accessory matching.
 */
export function ModelPicker() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // TODO(TASK-162): no model→accessory filter on the API yet — no-op for now.
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6"
    >
      <div className="min-w-[12rem]">
        <p className="font-display text-base font-semibold text-foreground">
          {dict.home.modelPicker.title}
        </p>
        <p className="text-sm text-muted-foreground">
          {dict.home.modelPicker.subtitle}
        </p>
      </div>

      <Select value={brand} onValueChange={setBrand}>
        <SelectTrigger
          aria-label={dict.home.modelPicker.brandAria}
          className="h-11 flex-1 basis-40 bg-background"
        >
          <SelectValue placeholder={dict.home.modelPicker.brandPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {brands.map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={model} onValueChange={setModel}>
        <SelectTrigger
          aria-label={dict.home.modelPicker.modelAria}
          className="h-11 flex-1 basis-40 bg-background"
        >
          <SelectValue placeholder={dict.home.modelPicker.modelPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="submit"
        size="lg"
        disabled={!brand || !model}
        className="h-11 cursor-pointer"
      >
        {dict.home.modelPicker.submit}
      </Button>
    </form>
  );
}
