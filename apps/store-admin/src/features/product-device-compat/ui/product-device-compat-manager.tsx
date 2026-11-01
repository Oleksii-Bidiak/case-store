"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  useDeviceControllerFindBrands,
  useDeviceControllerFindModels,
  useProductControllerUpdateDeviceCompat,
  useProductControllerUpdateGroupDeviceCompat,
} from "@/entities/device";
import { getProductControllerFindByIdQueryKey } from "@/entities/product";
import { DeviceSeriesPicker } from "@/features/device-series-picker";
import type { SectionSaveController } from "@/shared/lib/section-save";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

const c = dict.productCompat;

interface ProductDeviceCompatManagerProps {
  /**
   * The product whose compat set this is. Omitted in STAGED mode (TASK-442), on
   * `/products/new`: the selection is held by the parent until the product
   * exists, and no save button is offered.
   */
  productId?: string;
  /** The product's group id (null when standalone) — gates the bulk action. */
  groupId?: string | null;
  /** Device model ids the product is currently compatible with. */
  initialModelIds?: string[];
  /** STAGED mode: the full next selection, after every tick/untick. */
  onStage?: (deviceModelIds: string[]) => void;
  /**
   * Wave 198 (TASK-1050): the page's one «Зберегти» drives this section — no
   * save button here, `save()` / `discard()` on this handle instead.
   */
  controllerRef?: Ref<SectionSaveController>;
  /** Fired whenever the selection starts or stops differing from the saved set. */
  onDirtyChange?: (dirty: boolean) => void;
}

const NO_MODEL_IDS: string[] = [];

/**
 * The model list is asked for with the endpoint's ceiling (`@Max(200)`): its
 * DEFAULT page is 50, which hid ~150 of the 198 seeded models from this picker
 * (TASK-1134). Past 200 models the picker needs a server-side search — that is
 * the API half of TASK-1134.
 */
const MODEL_LIMIT = 200;

function sameSet(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((id) => a.has(id));
}

/**
 * ProductDeviceCompatManager — the admin «Сумісні пристрої» control (TASK-190).
 * Bound to the product's compat set via the dedicated
 * `PUT /products/:id/device-compat` endpoint (compat is not part of the product
 * create/update DTO). When the product belongs to a group, «Застосувати до всіх
 * позицій групи» copies the same set to every sibling position
 * (`PUT /products/group/:groupId/device-compat`) — immediately, as before: it
 * writes OTHER products, so it is not part of this form's save.
 *
 * TASK-1955 (DeviceCompat artboard 1): the models are picked BY SERIES — brand
 * tabs, a tri-state checkbox per series, the «Обрано N моделей» summary and the
 * partial-series reminder — through the shared {@link DeviceSeriesPicker}. The
 * section stays one block of the product form (stacked, not the mockup's two
 * columns: the form already has its own aside), under the page's one «Зберегти».
 *
 * `selected` seeds once from `initialModelIds` at mount — the parent only renders
 * this component after the product has loaded (docs/conventions/forms.md).
 *
 * STAGED MODE (TASK-442). Without a `productId` the save and the group action
 * drop away and every tick is reported to the parent instead.
 */
export function ProductDeviceCompatManager({
  productId,
  groupId = null,
  initialModelIds = NO_MODEL_IDS,
  onStage,
  controllerRef,
  onDirtyChange,
}: ProductDeviceCompatManagerProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialModelIds),
  );

  const { data: brandsData } = useDeviceControllerFindBrands();
  const { data: modelsData, isLoading } = useDeviceControllerFindModels({
    limit: MODEL_LIMIT,
  });
  const brands = useMemo(() => brandsData?.data ?? [], [brandsData]);
  const models = useMemo(() => modelsData?.data ?? [], [modelsData]);

  const update = useProductControllerUpdateDeviceCompat();
  const updateGroup = useProductControllerUpdateGroupDeviceCompat();

  const change = (next: Set<string>) => {
    setSelected(next);
    // STAGED mode: the parent is the only place this selection survives until
    // the product exists, so it learns about every tick as it happens.
    onStage?.([...next]);
  };

  const deviceModelIds = [...selected];

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getProductControllerFindByIdQueryKey(productId ?? ""),
    });

  const isDirty = Boolean(productId) && !sameSet(selected, initialModelIds);
  const lastDirtyRef = useRef(false);
  useEffect(() => {
    if (lastDirtyRef.current === isDirty) return;
    lastDirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Read at CALL time by the page's save chain — hence refs, refreshed after
  // every render.
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const discardRef = useRef<() => void>(() => {});
  const mutateAsync = update.mutateAsync;
  useEffect(() => {
    saveRef.current = async () => {
      if (!productId) return;
      await mutateAsync({ id: productId, data: { deviceModelIds } });
      await queryClient.invalidateQueries({
        queryKey: getProductControllerFindByIdQueryKey(productId),
      });
    };
    discardRef.current = () => setSelected(new Set(initialModelIds));
  });
  useImperativeHandle(
    controllerRef,
    () => ({
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    }),
    [],
  );

  const handleSave = () => {
    if (!productId) return;
    update.mutate(
      { id: productId, data: { deviceModelIds } },
      {
        onSuccess: () => {
          void invalidate();
          toast.success(c.toastSaved);
        },
        onError: () => toast.error(c.toastSaveFailed),
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
          toast.success(c.toastGroupApplied(response.data.updatedCount));
        },
        onError: () => toast.error(c.toastGroupFailed),
      },
    );
  };

  const pending = update.isPending || updateGroup.isPending;
  const ready = !isLoading && models.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <DeviceSeriesPicker
        models={models}
        brands={brands}
        isLoading={isLoading}
        value={selected}
        onChange={change}
        idPrefix="compat"
        showCounts
      />

      {!ready ? null : productId ? (
        <div className="flex flex-wrap items-center gap-3">
          {controllerRef ? null : (
            <Button type="button" onClick={handleSave} disabled={pending}>
              {update.isPending ? dict.common.saving : c.save}
            </Button>
          )}
          {groupId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleApplyToGroup}
              disabled={pending}
              title={c.applyToGroupHint}
            >
              {c.applyToGroup}
            </Button>
          )}
        </div>
      ) : (
        // Nothing to save to yet — «Створити товар» carries this selection.
        <p className="text-sm text-muted-foreground">{c.stagedHint}</p>
      )}
    </div>
  );
}
