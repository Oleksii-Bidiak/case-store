"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useDeviceControllerFindBrands,
  useDeviceControllerFindModels,
  useProductControllerUpdateDeviceCompat,
  useProductControllerUpdateGroupDeviceCompat,
} from "@/entities/device";
import { getProductControllerFindByIdQueryKey } from "@/entities/product";
import { Button, Checkbox, Label } from "@/shared/ui";
import { dict } from "@/shared/config";

interface ProductDeviceCompatManagerProps {
  productId: string;
  /** The product's group id (null when standalone) — gates the bulk action. */
  groupId: string | null;
  /** Device model ids the product is currently compatible with. */
  initialModelIds: string[];
}

/**
 * ProductDeviceCompatManager — the admin "Сумісні пристрої" control (TASK-190).
 * A brand-grouped checkbox list bound to the product's compat set via the
 * dedicated `PUT /products/:id/device-compat` endpoint (compat is not part of the
 * product create/update DTO). When the product belongs to a group, a
 * "Застосувати до всіх позицій групи" action copies the same set to every
 * sibling position (`PUT /products/group/:groupId/device-compat`).
 *
 * `selected` seeds once from `initialModelIds` at mount — the parent only renders
 * this component after the product has loaded, so no async re-seed guard is
 * needed (docs/conventions/forms.md).
 */
export function ProductDeviceCompatManager({
  productId,
  groupId,
  initialModelIds,
}: ProductDeviceCompatManagerProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialModelIds),
  );

  const { data: brandsData } = useDeviceControllerFindBrands();
  const { data: modelsData, isLoading } = useDeviceControllerFindModels();
  const brands = brandsData?.data ?? [];
  const models = useMemo(() => modelsData?.data ?? [], [modelsData]);

  const update = useProductControllerUpdateDeviceCompat();
  const updateGroup = useProductControllerUpdateGroupDeviceCompat();

  // Group active models by their brand, preserving brand sort order.
  const modelsByBrand = useMemo(() => {
    const map = new Map<string, typeof models>();
    for (const model of models) {
      const bucket = map.get(model.deviceBrandId);
      if (bucket) bucket.push(model);
      else map.set(model.deviceBrandId, [model]);
    }
    return map;
  }, [models]);

  const toggle = (modelId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(modelId);
      else next.delete(modelId);
      return next;
    });
  };

  const deviceModelIds = [...selected];

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getProductControllerFindByIdQueryKey(productId),
    });

  const handleSave = () => {
    update.mutate(
      { id: productId, data: { deviceModelIds } },
      {
        onSuccess: () => {
          void invalidate();
          toast.success(dict.productCompat.toastSaved);
        },
        onError: () => toast.error(dict.productCompat.toastSaveFailed),
      },
    );
  };

  const handleApplyToGroup = () => {
    if (!groupId) return;
    updateGroup.mutate(
      { groupId, data: { deviceModelIds } },
      {
        onSuccess: (response) => {
          void invalidate();
          toast.success(
            dict.productCompat.toastGroupApplied(response.data.updatedCount),
          );
        },
        onError: () => toast.error(dict.productCompat.toastGroupFailed),
      },
    );
  };

  const pending = update.isPending || updateGroup.isPending;

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.productCompat.loading}
      </p>
    );
  }

  if (models.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.productCompat.empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{dict.productCompat.hint}</p>

      <div className="flex flex-col gap-5">
        {brands.map((brand) => {
          const brandModels = modelsByBrand.get(brand.id) ?? [];
          if (brandModels.length === 0) return null;
          return (
            <fieldset key={brand.id} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-foreground">
                {brand.name}
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {brandModels.map((model) => {
                  const inputId = `compat-${model.id}`;
                  return (
                    <div key={model.id} className="flex items-center gap-2">
                      <Checkbox
                        id={inputId}
                        checked={selected.has(model.id)}
                        onCheckedChange={(checked) =>
                          toggle(model.id, checked === true)
                        }
                      />
                      <Label
                        htmlFor={inputId}
                        className="text-sm font-normal text-foreground"
                      >
                        {model.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={pending}>
          {update.isPending ? dict.common.saving : dict.productCompat.title}
        </Button>
        {groupId && (
          <Button
            type="button"
            variant="outline"
            onClick={handleApplyToGroup}
            disabled={pending}
            title={dict.productCompat.applyToGroupHint}
          >
            {dict.productCompat.applyToGroup}
          </Button>
        )}
      </div>
    </div>
  );
}
